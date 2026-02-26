// ============================================================
// app.js — メインアプリケーションコントローラ
// ============================================================
import {
    getAllRecords, addRecord, updateRecord, deleteRecord, getRecord,
    exportJSON, importJSON, exportCSV, clearAllData,
    getUniqueJockeys, getUniqueRaceNames, getSettings, saveSettings
} from './data.js';
import { filterRecords, calcStats, monthlyBreakdown, groupBy, getYears } from './stats.js';
import { renderMonthlyChart, renderGroupBarChart, renderReturnRateChart, destroyAll } from './charts.js';
import { extractTextFromImage, parseTicketText } from './ocr.js';
import { fetchRaceResult } from './netkeiba.js';

// ============================================================
// ユーティリティ
// ============================================================
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function formatCurrency(n) {
    return '¥' + (n || 0).toLocaleString();
}

function formatPercent(n) {
    return (Math.round((n || 0) * 10) / 10) + '%';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// ナビゲーション
// ============================================================
let currentPage = 'dashboard';

function navigateTo(page) {
    currentPage = page;
    $$('.page').forEach(p => p.classList.remove('active'));
    const target = $(`#page-${page}`);
    if (target) target.classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === page));

    if (page === 'dashboard') refreshDashboard();
    else if (page === 'add') initAddForm();
    else if (page === 'history') refreshHistory();
    else if (page === 'analysis') refreshAnalysis();
    else if (page === 'settings') refreshSettings();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// ダッシュボード
// ============================================================
function refreshDashboard() {
    const records = getAllRecords();
    const period = $('#dashboardPeriod').value;
    const filters = period === 'all' ? {} : { year: parseInt(period) };
    const filtered = filterRecords(records, filters);
    const stats = calcStats(filtered);

    // サマリーカード更新
    $('#statTotalAmount').textContent = formatCurrency(stats.totalAmount);
    $('#statTotalPayout').textContent = formatCurrency(stats.totalPayout);

    const balEl = $('#statBalance');
    balEl.textContent = formatCurrency(stats.balance);
    balEl.className = 'card-value ' + (stats.balance >= 0 ? 'positive' : 'negative');

    const returnEl = $('#statReturnRate');
    returnEl.textContent = formatPercent(stats.returnRate);
    returnEl.style.color = stats.returnRate >= 100 ? 'var(--accent-green)' : '';

    $('#statHitRate').textContent = formatPercent(stats.hitRate);
    $('#statCount').textContent = stats.count + '件';

    // 期間セレクタ更新
    populateYearSelect('#dashboardPeriod', records);

    // 目標回収率プログレスバー
    const settings = getSettings();
    const targetROI = settings.targetROI || 0;
    const progressContainer = $('#targetProgressContainer');
    if (targetROI > 0 && period === 'all') { // 生涯収支の時だけ表示するか、常時表示するか。常時表示にする
        progressContainer.style.display = 'block';
        $('#targetGoalValue').textContent = targetROI;
        $('#targetCurrentValue').textContent = Math.round(stats.returnRate);
        const progressPercent = Math.min(100, Math.max(0, (stats.returnRate / targetROI) * 100));
        $('#targetProgressBar').style.width = progressPercent + '%';
        if (progressPercent >= 100) {
            $('#targetProgressBar').style.boxShadow = '0 0 15px var(--accent-green)';
            $('#targetProgressBar').style.background = 'linear-gradient(90deg, var(--accent-green), #a8e6cf)';
        } else {
            $('#targetProgressBar').style.boxShadow = '';
            $('#targetProgressBar').style.background = '';
        }
    } else if (targetROI > 0) {
        progressContainer.style.display = 'block';
        $('#targetGoalValue').textContent = targetROI;
        $('#targetCurrentValue').textContent = Math.round(stats.returnRate);
        const progressPercent = Math.min(100, Math.max(0, (stats.returnRate / targetROI) * 100));
        $('#targetProgressBar').style.width = progressPercent + '%';
        $('#targetProgressBar').style.boxShadow = '';
        $('#targetProgressBar').style.background = '';
    } else {
        progressContainer.style.display = 'none';
    }

    // グラフ
    const year = period === 'all' ? null : parseInt(period);
    const monthly = monthlyBreakdown(filtered, year);
    renderMonthlyChart('chartMonthly', monthly);

    // 直近履歴
    renderRecentList(records);
}

function renderRecentList(records) {
    const container = $('#recentList');
    const recent = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = `
      <div class="history-empty" style="display:block; padding:30px;">
        <div class="empty-icon">🏇</div>
        <p>まだ購入記録がありません</p>
        <button class="btn btn-primary" data-nav="add">最初の記録を追加する</button>
      </div>`;
        attachNavListeners(container);
        return;
    }

    container.innerHTML = recent.map(r => renderRecordItem(r)).join('');
    attachRecordListeners(container);
}

// ============================================================
// レコードアイテムHTML
// ============================================================
function renderRecordItem(r) {
    const gradeHtml = r.grade && r.grade !== 'なし'
        ? `<span class="record-grade">${r.grade}</span>` : '';
    const raceNameHtml = r.raceName
        ? `<span class="record-race-name">${r.raceName}</span>` : '';
    const raceNumHtml = r.raceNumber
        ? `<span class="record-race-number">${r.raceNumber}R</span>` : '';

    const markHtml = r.predictionMark ? `<span class="record-mark">${r.predictionMark}</span>` : '';

    return `
    <div class="record-item" data-id="${r.id}">
      <div class="record-result ${r.isWin ? 'win' : 'lose'}">
        ${r.isWin ? '◎' : '×'}
      </div>
      <div class="record-info">
        <div class="record-top">
          ${markHtml}
          <span class="record-date">${formatDate(r.date)}</span>
          <span class="record-racecourse">${r.racecourse || ''}</span>
          ${raceNumHtml}
          ${raceNameHtml}
          ${gradeHtml}
        </div>
        <div class="record-bottom">
          <span class="record-bettype">${r.betType || ''}</span>
          ${r.selection ? `<span>| ${r.selection}</span>` : ''}
          ${r.jockey ? `<span>| ${r.jockey}</span>` : ''}
        </div>
      </div>
      <div class="record-amounts">
        <span class="record-amount">${formatCurrency(r.amount)}</span>
        <span class="record-payout ${r.isWin ? 'win' : 'lose'}">
          ${r.isWin ? '+' + formatCurrency(r.payout) : formatCurrency(0)}
        </span>
      </div>
      <div class="record-actions">
        <button class="btn-edit" data-id="${r.id}" title="編集">📝</button>
        <button class="btn-delete" data-id="${r.id}" title="削除">🗑️</button>
      </div>
    </div>`;
}

// ============================================================
// 購入記録入力フォーム
// ============================================================
let editingId = null;

function initAddForm() {
    if (!editingId) {
        $('#recordForm').reset();
        $('#editId').value = '';
        $('#toggleWin').dataset.value = 'false';
        $('#payoutGroup').style.display = 'none';
        $('#formTitle').textContent = '新規購入記録';
        $('#submitBtn').innerHTML = '<span class="btn-icon">💾</span> 保存する';
        $('#cancelBtn').style.display = 'none';

        // OCR系のボタンリセット
        $('#btnFetchResult').style.display = 'none';
        $('#ocrImageInput').value = '';

        // 予想印リセット
        const defaultMark = document.querySelector('input[name="predictionMark"][value=""]');
        if (defaultMark) defaultMark.checked = true;

        // 今日の日付をデフォルト
        const today = new Date().toISOString().slice(0, 10);
        $('#inputDate').value = today;
    }

    // サジェスト更新
    updateSuggestions();
}

function updateSuggestions() {
    const jockeys = getUniqueJockeys();
    $('#jockeySuggestions').innerHTML = jockeys.map(j => `<option value="${j}">`).join('');

    const raceNames = getUniqueRaceNames();
    $('#raceNameSuggestions').innerHTML = raceNames.map(n => `<option value="${n}">`).join('');
}

// ------------------------------------------------------------
// OCR関連処理
// ------------------------------------------------------------
async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        showLoading('画像を解析中...');

        // Tesseract.jsでのOCR実行
        const text = await extractTextFromImage(file, (progress) => {
            $('#loadingMessage').textContent = `画像を解析中... (${Math.round(progress * 100)}%)`;
        });

        console.log('--- OCR Result ---');
        console.log(text);
        console.log('------------------');

        // テキストから馬券情報をパース
        const parsed = parseTicketText(text);

        // フォームへの反映
        if (parsed.date) $('#inputDate').value = parsed.date;
        if (parsed.racecourse) $('#inputRacecourse').value = parsed.racecourse;
        if (parsed.raceNumber) $('#inputRaceNumber').value = parsed.raceNumber;
        if (parsed.betType) $('#inputBetType').value = parsed.betType;
        if (parsed.amount) $('#inputAmount').value = parsed.amount;
        if (parsed.selection) $('#inputSelection').value = parsed.selection;

        hideLoading();
        showToast('画像から情報を読み取りました', 'info');

        // 結果取得ボタンを表示
        if (parsed.date && parsed.racecourse && parsed.raceNumber && parsed.selection && parsed.betType) {
            $('#btnFetchResult').style.display = 'inline-flex';
        }
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    } finally {
        // 同じファイルでも再発火するようにクリア
        e.target.value = '';
    }
}

// ------------------------------------------------------------
// netkeiba 結果取得処理
// ------------------------------------------------------------
async function handleFetchResult() {
    const date = $('#inputDate').value;
    const racecourse = $('#inputRacecourse').value;
    const raceNum = $('#inputRaceNumber').value;
    const selection = $('#inputSelection').value;
    const betType = $('#inputBetType').value;
    const amount = parseInt($('#inputAmount').value, 10) || 0;

    if (!date || !racecourse || !raceNum || !selection || !betType) {
        showToast('日付、競馬場、レース番号、馬券種、馬番が必要です', 'error');
        return;
    }

    try {
        showLoading('レース結果を取得中...');
        const result = await fetchRaceResult(date, racecourse, raceNum, selection, betType);

        // フォームへの反映
        if (result.raceName) $('#inputRaceName').value = result.raceName;
        if (result.grade && result.grade !== 'なし') $('#inputGrade').value = result.grade;
        if (result.jockey) $('#inputJockey').value = result.jockey;

        $('#toggleWin').dataset.value = String(result.isWin);
        $('#payoutGroup').style.display = result.isWin ? 'flex' : 'none';

        // 払戻金の計算： (購入額 × 倍率)
        if (result.isWin && result.payoutMultiplier > 0 && amount > 0) {
            // 100円あたりの倍率で計算
            const totalPayout = Math.floor((amount / 100) * (result.payoutMultiplier * 100));
            $('#inputPayout').value = totalPayout;
        } else if (!result.isWin) {
            $('#inputPayout').value = '';
        }

        hideLoading();
        showToast(result.isWin ? '的中！結果をセットしました🤑' : '不的中…結果をセットしました😫', result.isWin ? 'success' : 'info');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    const data = {
        date: $('#inputDate').value,
        racecourse: $('#inputRacecourse').value,
        raceNumber: $('#inputRaceNumber').value,
        raceName: $('#inputRaceName').value,
        grade: $('#inputGrade').value,
        betType: $('#inputBetType').value,
        amount: $('#inputAmount').value,
        isWin: $('#toggleWin').dataset.value === 'true',
        payout: $('#inputPayout').value || 0,
        selection: $('#inputSelection').value,
        predictionMark: document.querySelector('input[name="predictionMark"]:checked')?.value || '',
        jockey: $('#inputJockey').value,
        memo: $('#inputMemo').value
    };

    if (editingId) {
        updateRecord(editingId, data);
        showToast('記録を更新しました');
        editingId = null;
    } else {
        addRecord(data);
        showToast('記録を保存しました');
    }

    $('#recordForm').reset();
    $('#toggleWin').dataset.value = 'false';
    $('#payoutGroup').style.display = 'none';
    editingId = null;
    $('#formTitle').textContent = '新規購入記録';
    $('#submitBtn').innerHTML = '<span class="btn-icon">💾</span> 保存する';
    $('#cancelBtn').style.display = 'none';
    $('#btnFetchResult').style.display = 'none';

    const today = new Date().toISOString().slice(0, 10);
    $('#inputDate').value = today;

    navigateTo('dashboard');
}

function startEdit(id) {
    const record = getRecord(id);
    if (!record) return;
    editingId = id;

    navigateTo('add');

    $('#editId').value = id;
    $('#inputDate').value = record.date || '';
    $('#inputRacecourse').value = record.racecourse || '';
    $('#inputRaceNumber').value = record.raceNumber || '';
    $('#inputRaceName').value = record.raceName || '';
    $('#inputGrade').value = record.grade || 'なし';
    $('#inputBetType').value = record.betType || '';
    $('#inputAmount').value = record.amount || '';
    $('#inputSelection').value = record.selection || '';
    $('#inputJockey').value = record.jockey || '';
    $('#inputMemo').value = record.memo || '';

    const mark = record.predictionMark || '';
    const radio = document.querySelector(`.mark-radio input[value="${mark}"]`);
    if (radio) radio.checked = true;

    const isWin = record.isWin;
    $('#toggleWin').dataset.value = String(isWin);
    $('#payoutGroup').style.display = isWin ? 'flex' : 'none';
    if (isWin) $('#inputPayout').value = record.payout || '';

    $('#formTitle').textContent = '記録を編集';
    $('#submitBtn').innerHTML = '<span class="btn-icon">💾</span> 更新する';
    $('#cancelBtn').style.display = 'inline-flex';
    $('#btnFetchResult').style.display = 'inline-flex';
}

// ============================================================
// 購入履歴一覧
// ============================================================
function refreshHistory() {
    const records = getAllRecords();
    populateYearSelect('#filterYear', records);
    populateRacecourseSelect(records);

    const filters = getHistoryFilters();
    const filtered = filterRecords(records, filters);
    const stats = calcStats(filtered);

    // サマリー
    const summary = $('#historySummary');
    summary.innerHTML = `
    <span class="hs-item">件数: <span class="hs-value">${stats.count}件</span></span>
    <span class="hs-item">購入額: <span class="hs-value">${formatCurrency(stats.totalAmount)}</span></span>
    <span class="hs-item">払戻額: <span class="hs-value">${formatCurrency(stats.totalPayout)}</span></span>
    <span class="hs-item">収支: <span class="hs-value" style="color:${stats.balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${formatCurrency(stats.balance)}</span></span>
    <span class="hs-item">回収率: <span class="hs-value">${formatPercent(stats.returnRate)}</span></span>`;

    // リスト
    const container = $('#historyList');
    const emptyEl = $('#historyEmpty');

    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyEl.style.display = 'block';
        attachNavListeners(emptyEl);
        if (currentHistoryView === 'calendar') renderCalendar(filtered, currentCalendarDate);
        return;
    }

    emptyEl.style.display = 'none';
    const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    container.innerHTML = sorted.map(r => renderRecordItem(r)).join('');
    attachRecordListeners(container);

    if (currentHistoryView === 'calendar') {
        renderCalendar(filtered, currentCalendarDate);
    }
}

function getHistoryFilters() {
    return {
        year: $('#filterYear').value ? parseInt($('#filterYear').value) : null,
        racecourse: $('#filterRacecourse').value || null,
        betType: $('#filterBetType').value || null,
        isWin: $('#filterResult').value || null,
        search: $('#historySearch').value || null
    };
}

function populateYearSelect(selector, records) {
    const select = $(selector);
    const currentVal = select.value;
    const years = getYears(records);
    const currentYear = new Date().getFullYear();

    // オプション再構築（allは保持）
    const allOption = select.querySelector('option[value="all"]') || select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (allOption) select.appendChild(allOption);

    // 年がなければ今年を追加
    if (years.length === 0) years.push(currentYear);

    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + '年';
        select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
}

function populateRacecourseSelect(records) {
    const select = $('#filterRacecourse');
    const currentVal = select.value;
    const courses = new Set(records.map(r => r.racecourse).filter(Boolean));

    select.innerHTML = '<option value="">全競馬場</option>';
    [...courses].sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
}

// ============================================================
// 分析・統計
// ============================================================
function refreshAnalysis() {
    const records = getAllRecords();
    populateYearSelect('#analysisPeriod', records);

    const period = $('#analysisPeriod').value;
    const filters = period === 'all' ? {} : { year: parseInt(period) };
    const filtered = filterRecords(records, filters);

    // アクティブタブ取得
    const activeTab = document.querySelector('.analysis-tab.active')?.dataset.tab || 'bettype';
    renderAnalysisPanel(activeTab, filtered);
}

function renderAnalysisPanel(tab, records) {
    const groupKey = {
        bettype: 'betType',
        racecourse: 'racecourse',
        jockey: 'jockey',
        grade: 'grade'
    }[tab];

    if (!groupKey) return;

    const groups = groupBy(records, groupKey);

    // チャート描画
    const chartId = 'chart' + tab.charAt(0).toUpperCase() + tab.slice(1);
    const chartReturnId = chartId + 'Return';

    // Top 15に制限（チャートが見にくくなるため）
    const topGroups = groups.slice(0, 15);
    renderGroupBarChart(chartId, topGroups);
    renderReturnRateChart(chartReturnId, topGroups);

    // テーブル更新
    const tableId = 'table' + tab.charAt(0).toUpperCase() + tab.slice(1);
    const tbody = $(`#${tableId} tbody`);
    if (tbody) {
        tbody.innerHTML = groups.map(g => {
            const balClass = g.balance >= 0 ? 'positive' : 'negative';
            const rrClass = g.returnRate >= 100 ? 'positive' : 'negative';
            return `
        <tr>
          <td class="highlight">${g.name}</td>
          <td>${g.count}</td>
          <td>${g.winCount}</td>
          <td>${formatPercent(g.hitRate)}</td>
          <td>${formatCurrency(g.totalAmount)}</td>
          <td>${formatCurrency(g.totalPayout)}</td>
          <td class="${balClass}">${formatCurrency(g.balance)}</td>
          <td class="${rrClass}">${formatPercent(g.returnRate)}</td>
        </tr>`;
        }).join('');
    }
}

// ============================================================
// 設定
// ============================================================
function refreshSettings() {
    const records = getAllRecords();
    $('#settingsRecordCount').textContent = records.length + '件';

    const settings = getSettings();
    $('#themeSelect').value = settings.theme || 'light';
    $('#inputTargetROI').value = settings.targetROI || '';
}

function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const icon = $('#themeToggle .theme-icon');
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';

    // Update theme toggle text
    const toggleBtn = $('#themeToggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = `<span class="theme-icon">${theme === 'dark' ? '🌙' : '☀️'}</span> ${theme === 'dark' ? 'ダーク' : 'ライト'}`;
    }
}

// ============================================================
// モーダル
// ============================================================
let modalResolve = null;

function showLoading(message = '処理中...') {
    $('#loadingMessage').textContent = message;
    $('#loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    $('#loadingOverlay').style.display = 'none';
}

function showModal(title, message) {
    return new Promise(resolve => {
        modalResolve = resolve;
        $('#modalTitle').textContent = title;
        $('#modalMessage').textContent = message;
        $('#modalOverlay').classList.add('active');
    });
}

function closeModal(result) {
    $('#modalOverlay').classList.remove('active');
    if (modalResolve) {
        modalResolve(result);
        modalResolve = null;
    }
}

// ============================================================
// レコードアイテムのイベント委譲
// ============================================================
function attachRecordListeners(container) {
    container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEdit(btn.dataset.id);
        });
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await showModal('削除確認', 'この購入記録を削除しますか？この操作は取り消せません。');
            if (ok) {
                deleteRecord(btn.dataset.id);
                showToast('記録を削除しました');
                if (currentPage === 'history') refreshHistory();
                else if (currentPage === 'dashboard') refreshDashboard();
            }
        });
    });
}

function attachNavListeners(container) {
    container.querySelectorAll('[data-nav]').forEach(el => {
        el.addEventListener('click', () => navigateTo(el.dataset.nav));
    });
}

// ============================================================
// イベントリスナー初期化
// ============================================================
function init() {
    // テーマ適用
    const settings = getSettings();
    applyTheme(settings.theme || 'light');

    // ナビゲーション
    $$('.nav-item, [data-nav]').forEach(el => {
        el.addEventListener('click', () => {
            const target = el.dataset.nav;
            if (target) navigateTo(target);
        });
    });

    // テーマトグル（ヘッダー）
    $('#themeToggle').addEventListener('click', () => {
        const current = document.body.dataset.theme;
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        saveSettings({ ...getSettings(), theme: next });
        $('#themeSelect').value = next;
    });

    // テーマセレクト（設定）
    $('#themeSelect').addEventListener('change', (e) => {
        applyTheme(e.target.value);
        saveSettings({ ...getSettings(), theme: e.target.value });
    });

    // ダッシュボード期間切替
    $('#dashboardPeriod').addEventListener('change', () => refreshDashboard());

    // フォーム送信
    $('#recordForm').addEventListener('submit', handleFormSubmit);

    // OCR・自動取得
    $('#btnUploadImage').addEventListener('click', () => $('#ocrImageInput').click());
    $('#ocrImageInput').addEventListener('change', handleImageUpload);
    $('#btnFetchResult').addEventListener('click', handleFetchResult);

    // 的中トグル
    $('#toggleWin').addEventListener('click', () => {
        const btn = $('#toggleWin');
        const val = btn.dataset.value === 'true' ? 'false' : 'true';
        btn.dataset.value = val;
        $('#payoutGroup').style.display = val === 'true' ? 'flex' : 'none';
        if (val === 'false') $('#inputPayout').value = '';
    });

    // キャンセルボタン
    $('#cancelBtn').addEventListener('click', () => {
        editingId = null;
        $('#recordForm').reset();
        $('#toggleWin').dataset.value = 'false';
        $('#payoutGroup').style.display = 'none';
        $('#formTitle').textContent = '新規購入記録';
        $('#submitBtn').innerHTML = '<span class="btn-icon">💾</span> 保存する';
        $('#cancelBtn').style.display = 'none';
        $('#btnFetchResult').style.display = 'none';
        navigateTo('dashboard');
    });

    // 履歴フィルタ
    ['#filterYear', '#filterRacecourse', '#filterBetType', '#filterResult'].forEach(sel => {
        $(sel).addEventListener('change', () => refreshHistory());
    });

    // 履歴検索（debounce）
    let searchTimer;
    $('#historySearch').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => refreshHistory(), 300);
    });

    // 分析タブ切替
    $$('.analysis-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.analysis-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            $$('.analysis-panel').forEach(p => p.classList.remove('active'));
            const panel = $(`#panel-${tab.dataset.tab}`);
            if (panel) panel.classList.add('active');

            // 分析再描画
            const records = getAllRecords();
            const period = $('#analysisPeriod').value;
            const filters = period === 'all' ? {} : { year: parseInt(period) };
            const filtered = filterRecords(records, filters);
            renderAnalysisPanel(tab.dataset.tab, filtered);
        });
    });

    // 分析期間切替
    $('#analysisPeriod').addEventListener('change', () => refreshAnalysis());

    // 設定：エクスポート
    $('#btnExportJSON').addEventListener('click', () => {
        exportJSON();
        showToast('JSONエクスポート完了');
    });

    $('#btnExportCSV').addEventListener('click', () => {
        exportCSV();
        showToast('CSVエクスポート完了');
    });

    // 設定：インポート
    $('#btnImportJSON').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const count = await importJSON(file);
            showToast(`${count}件のデータをインポートしました`, 'success');
            refreshSettings();
        } catch (err) {
            showToast('インポートに失敗しました: ' + err.message, 'error');
        }
        e.target.value = '';
    });

    // 設定：全削除
    $('#btnClearAll').addEventListener('click', async () => {
        const ok = await showModal(
            '全データ削除',
            'すべての購入記録が完全に削除されます。この操作は取り消せません。本当に削除しますか？'
        );
        if (ok) {
            clearAllData();
            showToast('全データを削除しました');
            refreshSettings();
        }
    });

    // モーダル
    $('#modalConfirm').addEventListener('click', () => closeModal(true));
    $('#modalCancel').addEventListener('click', () => closeModal(false));
    $('#modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal(false);
    });

    // 設定：目標回収率保存
    $('#btnSaveTargetROI').addEventListener('click', () => {
        const val = parseInt($('#inputTargetROI').value, 10) || 0;
        saveSettings({ ...getSettings(), targetROI: val });
        showToast('目標設定を保存しました');
    });

    // 履歴：ビュー切替
    $$('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentHistoryView = btn.dataset.view;
            if (currentHistoryView === 'list') {
                $('#viewListContainer').style.display = 'block';
                $('#viewCalendarContainer').style.display = 'none';
            } else {
                $('#viewListContainer').style.display = 'none';
                $('#viewCalendarContainer').style.display = 'block';
                refreshHistory();
            }
        });
    });

    // カレンダー操作
    $('#btnPrevMonth').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        refreshHistory();
    });
    $('#btnNextMonth').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        refreshHistory();
    });

    // 画像シェア (Dashboard)
    $('#btnShareDashboard').addEventListener('click', async () => {
        try {
            showLoading('画像を生成中...');
            const dashboardCard = $('#summaryCards');
            const canvas = await html2canvas(dashboardCard, {
                backgroundColor: document.body.dataset.theme === 'dark' ? '#121212' : '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true
            });
            const dataUrl = canvas.toDataURL('image/png');

            // Download logic
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `keiba-ledger-dashboard-${new Date().toISOString().slice(0, 10)}.png`;
            a.click();

            hideLoading();
            showToast('画像をダウンロードしました！SNSでシェアしよう🐎', 'success');
        } catch (e) {
            hideLoading();
            showToast('画像の生成に失敗しました: ' + e.message, 'error');
        }
    });

    // 初期表示
    navigateTo('dashboard');
}

// ============================================================
// カレンダービュー描画
// ============================================================
let currentHistoryView = 'list';
let currentCalendarDate = new Date();

function renderCalendar(records, displayDate) {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    $('#calendarMonthLabel').textContent = `${year}年 ${month + 1}月`;

    const grid = $('#calendarGrid');
    grid.innerHTML = '';

    // ヘッダー行 (日〜土)
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    days.forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell header';
        cell.textContent = d;
        grid.appendChild(cell);
    });

    // 月初めの曜日
    const firstDay = new Date(year, month, 1).getDay();
    // 月の日数
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 空白埋め
    for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell empty';
        grid.appendChild(cell);
    }

    // データイベントマッピング (YYYY-MM-DD -> records)
    const dateMap = {};
    records.forEach(r => {
        if (!r.date) return;
        if (!dateMap[r.date]) dateMap[r.date] = [];
        dateMap[r.date].push(r);
    });

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell';

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dateSpan = document.createElement('div');
        dateSpan.className = 'calendar-date';
        dateSpan.textContent = day;
        cell.appendChild(dateSpan);

        if (dateMap[dateStr]) {
            const dayRecords = dateMap[dateStr];
            let hasWin = false;
            let hasLose = false;
            dayRecords.forEach(r => {
                if (r.isWin) hasWin = true;
                else hasLose = true;
            });

            // マーカーコンテナ
            const markers = document.createElement('div');
            markers.style.display = 'flex';
            markers.style.gap = '4px';

            if (hasWin) {
                const mark = document.createElement('div');
                mark.className = 'calendar-marker win';
                markers.appendChild(mark);
            }
            if (hasLose) {
                const mark = document.createElement('div');
                mark.className = 'calendar-marker lose';
                markers.appendChild(mark);
            }
            cell.appendChild(markers);

            // クリックしてその日の記録でリストをフィルタするなどの拡張が可能
            cell.title = `${dayRecords.length}件の記録`;
        }

        grid.appendChild(cell);
    }
}

// ============================================================
// 起動
// ============================================================
document.addEventListener('DOMContentLoaded', init);
