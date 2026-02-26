// ============================================================
// data.js — データ管理レイヤー (LocalStorage CRUD + Import/Export)
// ============================================================
import { STORAGE_KEY, SETTINGS_KEY } from './constants.js';

// --- UUID生成 ---
function generateId() {
    return crypto.randomUUID ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
}

// --- 全レコード取得 ---
export function getAllRecords() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

// --- レコード保存 (内部) ---
function saveAll(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// --- レコード追加 ---
export function addRecord(data) {
    const records = getAllRecords();
    const now = new Date().toISOString();
    const record = {
        id: generateId(),
        date: data.date,
        racecourse: data.racecourse,
        raceNumber: parseInt(data.raceNumber, 10) || null,
        raceName: data.raceName || '',
        grade: data.grade || 'なし',
        betType: data.betType,
        amount: parseInt(data.amount, 10) || 0,
        isWin: !!data.isWin,
        payout: parseInt(data.payout, 10) || 0,
        selection: data.selection || '',
        predictionMark: data.predictionMark || '',
        jockey: data.jockey || '',
        memo: data.memo || '',
        createdAt: now,
        updatedAt: now
    };
    records.push(record);
    saveAll(records);
    return record;
}

// --- レコード更新 ---
export function updateRecord(id, data) {
    const records = getAllRecords();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    records[idx] = {
        ...records[idx],
        date: data.date,
        racecourse: data.racecourse,
        raceNumber: parseInt(data.raceNumber, 10) || null,
        raceName: data.raceName || '',
        grade: data.grade || 'なし',
        betType: data.betType,
        amount: parseInt(data.amount, 10) || 0,
        isWin: !!data.isWin,
        payout: parseInt(data.payout, 10) || 0,
        selection: data.selection || '',
        predictionMark: data.predictionMark || '',
        jockey: data.jockey || '',
        memo: data.memo || '',
        updatedAt: new Date().toISOString()
    };
    saveAll(records);
    return records[idx];
}

// --- レコード削除 ---
export function deleteRecord(id) {
    const records = getAllRecords().filter(r => r.id !== id);
    saveAll(records);
}

// --- レコード1件取得 ---
export function getRecord(id) {
    return getAllRecords().find(r => r.id === id) || null;
}

// --- JSONエクスポート ---
export function exportJSON() {
    const data = getAllRecords();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keiba_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- JSONインポート ---
export function importJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!Array.isArray(data)) throw new Error('Invalid format');
                saveAll(data);
                resolve(data.length);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsText(file);
    });
}

// --- CSVエクスポート ---
export function exportCSV() {
    const records = getAllRecords();
    const headers = ['日付', '競馬場', 'レース番号', 'レース名', 'グレード', '馬券種', '購入金額', '的中', '払戻金額', '予想印', '馬番/組番', '騎手', 'メモ'];
    const rows = records.map(r => [
        r.date, r.racecourse, r.raceNumber || '', r.raceName, r.grade,
        r.betType, r.amount, r.isWin ? '○' : '×', r.payout,
        r.predictionMark || '', r.selection, r.jockey, r.memo
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keiba_data_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- 全データ削除 ---
export function clearAllData() {
    localStorage.removeItem(STORAGE_KEY);
}

// --- ユニーク騎手名一覧（サジェスト用） ---
export function getUniqueJockeys() {
    const records = getAllRecords();
    const set = new Set(records.map(r => r.jockey).filter(Boolean));
    return [...set].sort();
}

// --- ユニークレース名一覧（サジェスト用） ---
export function getUniqueRaceNames() {
    const records = getAllRecords();
    const set = new Set(records.map(r => r.raceName).filter(Boolean));
    return [...set].sort();
}

// --- 設定の取得 ---
export function getSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : { theme: 'light', targetROI: 0 };
    } catch {
        return { theme: 'light', targetROI: 0 };
    }
}

// --- 設定の保存 ---
export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
