// ============================================================
// stats.js — 統計計算モジュール
// ============================================================
import { getAllRecords } from './data.js';

// --- フィルタ適用 ---
export function filterRecords(records, filters = {}) {
    let result = [...records];

    if (filters.year) {
        result = result.filter(r => r.date && r.date.startsWith(String(filters.year)));
    }
    if (filters.month) {
        const ym = `${filters.year}-${String(filters.month).padStart(2, '0')}`;
        result = result.filter(r => r.date && r.date.startsWith(ym));
    }
    if (filters.racecourse) {
        result = result.filter(r => r.racecourse === filters.racecourse);
    }
    if (filters.jockey) {
        result = result.filter(r => r.jockey === filters.jockey);
    }
    if (filters.betType) {
        result = result.filter(r => r.betType === filters.betType);
    }
    if (filters.grade) {
        result = result.filter(r => r.grade === filters.grade);
    }
    if (filters.isWin !== undefined && filters.isWin !== null && filters.isWin !== '') {
        const win = filters.isWin === true || filters.isWin === 'true';
        result = result.filter(r => r.isWin === win);
    }
    if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(r =>
            (r.raceName && r.raceName.toLowerCase().includes(q)) ||
            (r.jockey && r.jockey.toLowerCase().includes(q)) ||
            (r.racecourse && r.racecourse.toLowerCase().includes(q)) ||
            (r.memo && r.memo.toLowerCase().includes(q)) ||
            (r.selection && r.selection.toLowerCase().includes(q))
        );
    }
    return result;
}

// --- 基本統計計算 ---
export function calcStats(records) {
    const count = records.length;
    const totalAmount = records.reduce((s, r) => s + (r.amount || 0), 0);
    const totalPayout = records.reduce((s, r) => s + (r.payout || 0), 0);
    const winCount = records.filter(r => r.isWin).length;
    const balance = totalPayout - totalAmount;
    const returnRate = totalAmount > 0 ? (totalPayout / totalAmount) * 100 : 0;
    const hitRate = count > 0 ? (winCount / count) * 100 : 0;

    return { count, totalAmount, totalPayout, balance, returnRate, hitRate, winCount };
}

// --- 月別収支データ ---
export function monthlyBreakdown(records, year) {
    const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        amount: 0,
        payout: 0,
        balance: 0,
        count: 0,
        winCount: 0
    }));

    const filtered = year
        ? records.filter(r => r.date && r.date.startsWith(String(year)))
        : records;

    filtered.forEach(r => {
        if (!r.date) return;
        const m = parseInt(r.date.split('-')[1], 10) - 1;
        if (m >= 0 && m < 12) {
            months[m].amount += r.amount || 0;
            months[m].payout += r.payout || 0;
            months[m].balance += (r.payout || 0) - (r.amount || 0);
            months[m].count++;
            if (r.isWin) months[m].winCount++;
        }
    });

    return months;
}

// --- グループ別統計 ---
export function groupBy(records, key) {
    const groups = {};
    records.forEach(r => {
        const val = r[key] || '未指定';
        if (!groups[val]) groups[val] = [];
        groups[val].push(r);
    });

    return Object.entries(groups).map(([name, recs]) => ({
        name,
        ...calcStats(recs)
    })).sort((a, b) => b.totalAmount - a.totalAmount);
}

// --- 年リスト取得 ---
export function getYears(records) {
    const years = new Set();
    records.forEach(r => {
        if (r.date) years.add(parseInt(r.date.split('-')[0], 10));
    });
    return [...years].sort((a, b) => b - a);
}

// --- 累計収支推移データ ---
export function cumulativeBalance(records) {
    const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let cumBal = 0;
    return sorted.map(r => {
        cumBal += (r.payout || 0) - (r.amount || 0);
        return { date: r.date, balance: cumBal };
    });
}
