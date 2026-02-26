// ============================================================
// ocr.js — 画像からのテキスト抽出モジュール (Tesseract.js)
// ============================================================

/**
 * Tesseract.jsを用いて画像からテキストを抽出する
 * @param {File} file - アップロードされた画像ファイル
 * @param {Function} onProgress - 進捗コールバック
 * @returns {Promise<string>} 抽出されたテキスト
 */
export async function extractTextFromImage(file, onProgress) {
    if (!window.Tesseract) {
        throw new Error('Tesseract.js が読み込まれていません');
    }

    try {
        const worker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text' && onProgress) {
                    onProgress(m.progress);
                }
            }
        });

        await worker.loadLanguage('jpn');
        await worker.initialize('jpn');

        // 画像のURLを作成
        const imageUrl = URL.createObjectURL(file);

        // OCR実行
        const { data: { text } } = await worker.recognize(imageUrl);

        // クリーンアップ
        URL.revokeObjectURL(imageUrl);
        await worker.terminate();

        return text;
    } catch (error) {
        console.error('OCR Error:', error);
        throw new Error('画像の読み取りに失敗しました。');
    }
}

/**
 * OCRテキストから馬券情報をパースする
 * @param {string} text - OCR結果テキスト
 * @returns {Object} 抽出データ
 */
export function parseTicketText(text) {
    const result = {
        date: null,
        racecourse: null,
        raceNumber: null,
        betType: null,
        selection: null,
        amount: null,
        rawText: text
    };

    // 年月日の抽出 (例: 2024年2月18日 または 24年2月18日)
    const dateMatch = text.match(/(?:20)?(\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (dateMatch) {
        const year = dateMatch[1].length === 2 ? `20${dateMatch[1]}` : dateMatch[1];
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        result.date = `${year}-${month}-${day}`;
    }

    // 競馬場の抽出 (中央10場優先)
    const courses = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'];
    for (const course of courses) {
        if (text.includes(course)) {
            result.racecourse = course;
            break;
        }
    }

    // レース番号の抽出 (例: 11 R または 11R)
    const raceMatch = text.match(/(\d{1,2})\s*R/i);
    if (raceMatch) {
        result.raceNumber = raceMatch[1];
    }

    // 馬券種の抽出
    const betTypes = ['単勝', '複勝', '枠連', '馬連', 'ワイド', '馬単', '3連複', '3連単', 'WIN5'];
    for (const bt of betTypes) {
        if (text.includes(bt)) {
            result.betType = bt;
            break;
        }
    }

    // 購入金額の抽出 (例: 1,000円, 1000円, 500 円)
    const amountMatch = text.match(/([\d,]+)\s*円/);
    if (amountMatch) {
        result.amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    }

    // 購入馬番の抽出はノイズが多いため簡易的な推測
    // 「馬連 3-5」や「3連単 1-5-8」などのパターンを探す
    let betPattern = null;
    if (result.betType === '3連単' || result.betType === '3連複') {
        betPattern = text.match(/(\d{1,2})\s*[-=ー]\s*(\d{1,2})\s*[-=ー]\s*(\d{1,2})/);
        if (betPattern) result.selection = `${betPattern[1]}-${betPattern[2]}-${betPattern[3]}`;
    } else if (result.betType === '馬単' || result.betType === '馬連' || result.betType === 'ワイド' || result.betType === '枠連') {
        betPattern = text.match(/(\d{1,2})\s*[-=ー]\s*(\d{1,2})/);
        if (betPattern) result.selection = `${betPattern[1]}-${betPattern[2]}`;
    } else if (result.betType === '単勝' || result.betType === '複勝') {
        // 1単独の数字を探すのはリスクが高いので空にするか、より精巧なパースが必要
    }

    return result;
}
