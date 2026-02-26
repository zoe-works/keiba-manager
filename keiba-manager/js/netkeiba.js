// ============================================================
// netkeiba.js — netkeiba.com スクレイピングモジュール
// ============================================================

const PROXY_URL = 'https://api.allorigins.win/get?url=';

// 中央競馬場 マッピング (netkeiba venue code)
const VENUE_CODES = {
    '札幌': '01',
    '函館': '02',
    '福島': '03',
    '新潟': '04',
    '東京': '05',
    '中山': '06',
    '中京': '07',
    '京都': '08',
    '阪神': '09',
    '小倉': '10'
};

/**
 * 日付、競馬場、レース番号からnetkeibaのレースIDを生成する
 */
export function buildRaceId(dateStr, racecourse, raceNumber) {
    if (!dateStr || !racecourse || !raceNumber) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const venueCode = VENUE_CODES[racecourse];
    if (!venueCode) return null;

    const rNum = String(raceNumber).padStart(2, '0');

    // netkeiba race_id format: YYYYMMDDVVRR
    // 注意: 正式なrace_idは開催回数等も含む12桁(例: 202405010111 = 2024年東京1回1日目11R)だが、
    // URLでの日付アクセスなどを代替手段として使うアプローチも必要になる場合がある。
    // ここでは日付ベースのレース一覧 (kaisai_date) から対象のレースIDを探す方針を採る。
    const kaisaiDate = `${year}${month}${day}`;
    return { kaisaiDate, venueCode, rNum };
}

/**
 * 開催日のレース一覧HTMLから対象競馬場・レース番号のURL(レースID)を抽出する
 */
async function findRaceUrl(kaisaiDate, venueName, raceNumber) {
    const listUrl = `https://race.netkeiba.com/top/race_list.html?kaisai_date=${kaisaiDate}`;
    try {
        const res = await fetch(`${PROXY_URL}${encodeURIComponent(listUrl)}`);
        const data = await res.json();
        const html = data.contents;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 各競馬場のブロックを探す
        const raceLists = doc.querySelectorAll('.RaceList_DataList');
        for (const list of raceLists) {
            const titleEl = list.querySelector('.RaceList_DataTitle .TitleHeading');
            if (titleEl && titleEl.textContent.includes(venueName)) {
                // 対象競馬場が見つかった場合、該当のレース番号のリンクを探す
                const items = list.querySelectorAll('.RaceList_DataItem');
                for (const item of items) {
                    const rNumEl = item.querySelector('.Race_Num');
                    if (rNumEl && rNumEl.textContent.includes(String(raceNumber))) {
                        const link = item.querySelector('a');
                        return link ? link.getAttribute('href') : null;
                    }
                }
            }
        }
        return null; // 見つからない場合
    } catch (error) {
        console.error('findRaceUrl Error:', error);
        return null;
    }
}

/**
 * レース結果を取得してパースする
 * @param {string} dateStr - 2024-02-18
 * @param {string} racecourse - 東京
 * @param {string|number} raceNumber - 11
 * @param {string} selection - 5-8 (購入馬番)
 * @param {string} betType - 馬連
 */
export async function fetchRaceResult(dateStr, racecourse, raceNumber, selection, betType) {
    const d = new Date(dateStr);
    const kaisaiDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    // 1. レース一覧からURLを取得
    let raceRef = await findRaceUrl(kaisaiDate, racecourse, raceNumber);

    // /race/result.html?race_id=... の形式を期待
    if (!raceRef) {
        throw new Error('対象のレースが見つかりませんでした。(日付けや競馬場が正しいか確認してください)');
    }

    // raceRefが相対パスなら絶対パスへ
    let resultUrl = raceRef;
    if (resultUrl.startsWith('../race/')) {
        resultUrl = resultUrl.replace('../race/', 'https://race.netkeiba.com/race/');
    } else if (!resultUrl.startsWith('http')) {
        resultUrl = 'https://race.netkeiba.com' + resultUrl;
    }

    // resultUrlは出馬表かもしれないので、結果ページに明示的に変換する
    resultUrl = resultUrl.replace('shutuba.html', 'result.html').replace('race_id', 'race_id');

    try {
        const res = await fetch(`${PROXY_URL}${encodeURIComponent(resultUrl)}`);
        const data = await res.json();
        const html = data.contents;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        return parseResultHTML(doc, selection, betType);
    } catch (error) {
        console.error('fetchRaceResult Error:', error);
        throw new Error('レース結果の取得に失敗しました。');
    }
}

function parseResultHTML(doc, selection, betType) {
    const result = {
        isWin: false,
        payoutMultiplier: 0,
        jockey: '',
        raceName: '',
        grade: 'なし'
    };

    // 1. レース名・グレード取得
    const raceNameEl = doc.querySelector('.RaceName');
    if (raceNameEl) result.raceName = raceNameEl.textContent.trim();

    const gradeEl = doc.querySelector('.RaceData01 .Icon_GradeType');
    if (gradeEl) result.grade = gradeEl.textContent.trim();

    // 2. 騎手名の取得（購入した馬番から検索）
    // 複数馬番がある場合 (例: 5-8)
    let targetHorseNum = selection;
    if (selection && selection.includes('-')) {
        targetHorseNum = selection.split('-')[0]; // とりあえず軸となる最初の馬番で探す
    } else if (selection && selection.includes('=')) {
        targetHorseNum = selection.split('=')[0];
    }

    if (targetHorseNum) {
        const rows = doc.querySelectorAll('#All_Result_Table tbody tr');
        for (const row of rows) {
            const numEl = row.querySelector('.Num');
            if (numEl && numEl.textContent.trim() === targetHorseNum.trim()) {
                const jockeyEl = row.querySelector('.Jockey a');
                if (jockeyEl) {
                    result.jockey = jockeyEl.textContent.trim();
                }
                break;
            }
        }
    }

    // 3. 払戻金の解析・的中の判定
    // 払戻テーブルは "Pay_Table"
    const payTables = doc.querySelectorAll('.Pay_Table');
    if (!payTables.length) return result; // 結果がまだない

    // betTypeに応じて対象行を探す
    let betRowClass = '';
    switch (betType) {
        case '単勝': betRowClass = 'Tansho'; break;
        case '複勝': betRowClass = 'Fukusho'; break;
        case '枠連': betRowClass = 'Wakuren'; break;
        case '馬連': betRowClass = 'Umaren'; break;
        case 'ワイド': betRowClass = 'Wide'; break;
        case '馬単': betRowClass = 'Umatan'; break;
        case '3連複': betRowClass = 'Fuku3'; break;
        case '3連単': betRowClass = 'Tan3'; break;
    }

    if (betRowClass && selection) {
        let selNormalized = selection.replace(/\s/g, '').replace(/ー/g, '-');
        for (const table of payTables) {
            const row = table.querySelector(`tr.${betRowClass}`);
            if (row) {
                const resultCol = row.querySelector('.Result');
                const payoutCol = row.querySelector('.Payout');

                if (resultCol && payoutCol) {
                    // 複数の結果（同着や複数的中のワイド・複勝など）があるためliで分かれている
                    const resultItems = resultCol.querySelectorAll('li');
                    const payoutItems = payoutCol.querySelectorAll('li');

                    for (let i = 0; i < resultItems.length; i++) {
                        const resText = resultItems[i].textContent.trim();
                        // 例: "5 - 8" と "5-8" の表記揺れ吸収
                        if (resText.replace(/\s/g, '') === selNormalized) {
                            result.isWin = true;
                            const payText = payoutItems[i] ? payoutItems[i].textContent.replace(/,/g, '').replace('円', '') : '0';
                            result.payoutMultiplier = parseFloat(payText) / 100; // 100円あたりの倍率
                            break;
                        }
                    }
                }
            }
        }
    }

    return result;
}
