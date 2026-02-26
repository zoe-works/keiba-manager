// ============================================================
// constants.js — マスターデータ・定数定義
// ============================================================

export const RACECOURSES = {
    central: [
        '札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉'
    ],
    regional: [
        '大井', '川崎', '船橋', '浦和', '門別', '園田', '佐賀', '高知',
        '名古屋', '笠松', '金沢', '盛岡', '水沢'
    ],
    overseas: [
        'ドバイ', '香港', 'パリロンシャン', 'ブリーダーズカップ',
        'ロイヤルアスコット', 'その他海外'
    ]
};

export const ALL_RACECOURSES = [
    ...RACECOURSES.central,
    ...RACECOURSES.regional,
    ...RACECOURSES.overseas
];

export const BET_TYPES = [
    '単勝', '複勝', '枠連', '馬連', 'ワイド', '馬単', '3連複', '3連単', 'WIN5'
];

export const GRADES = [
    'GI', 'GII', 'GIII', 'OP', 'リステッド', '条件戦', '未勝利', '新馬', 'なし'
];

export const RACECOURSE_CATEGORY = (() => {
    const map = {};
    RACECOURSES.central.forEach(r => map[r] = 'central');
    RACECOURSES.regional.forEach(r => map[r] = 'regional');
    RACECOURSES.overseas.forEach(r => map[r] = 'overseas');
    return map;
})();

export const STORAGE_KEY = 'keiba_records';
export const SETTINGS_KEY = 'keiba_settings';

export const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
