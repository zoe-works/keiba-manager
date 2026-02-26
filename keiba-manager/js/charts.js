// ============================================================
// charts.js — Chart.js ラッパーモジュール
// ============================================================

const CHART_COLORS = {
    gold: '#d4af37',
    goldLight: 'rgba(212, 175, 55, 0.3)',
    green: '#27ae60',
    greenLight: 'rgba(39, 174, 96, 0.3)',
    red: '#e74c3c',
    redLight: 'rgba(231, 76, 60, 0.3)',
    blue: '#2980b9',
    blueLight: 'rgba(41, 128, 185, 0.3)',
    purple: '#9b59b6',
    white: 'rgba(255,255,255,0.8)',
    grid: 'rgba(255,255,255,0.06)',
    palette: [
        '#d4af37', '#27ae60', '#2980b9', '#e74c3c', '#9b59b6',
        '#1abc9c', '#e67e22', '#f1c40f', '#34495e', '#e91e63'
    ]
};

let chartInstances = {};

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
        delete chartInstances[id];
    }
}

function getCtx(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    return el.getContext('2d');
}

const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: CHART_COLORS.white, font: { family: "'Inter', sans-serif", size: 12 } }
        },
        tooltip: {
            backgroundColor: 'rgba(20,20,30,0.95)',
            titleColor: CHART_COLORS.gold,
            bodyColor: '#fff',
            borderColor: CHART_COLORS.gold,
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            titleFont: { family: "'Inter', sans-serif", weight: 'bold' },
            bodyFont: { family: "'Inter', sans-serif" }
        }
    },
    scales: {
        x: {
            ticks: { color: 'rgba(255,255,255,0.6)', font: { family: "'Inter', sans-serif", size: 11 } },
            grid: { color: CHART_COLORS.grid }
        },
        y: {
            ticks: {
                color: 'rgba(255,255,255,0.6)',
                font: { family: "'Inter', sans-serif", size: 11 },
                callback: v => v.toLocaleString()
            },
            grid: { color: CHART_COLORS.grid }
        }
    }
};

// --- 月別収支推移（折れ線） ---
export function renderMonthlyChart(canvasId, monthlyData) {
    destroyChart(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const gradGold = ctx.createLinearGradient(0, 0, 0, 400);
    gradGold.addColorStop(0, 'rgba(212, 175, 55, 0.6)');
    gradGold.addColorStop(1, 'rgba(212, 175, 55, 0.05)');

    const labels = monthlyData.map(m => `${m.month}月`);
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '収支',
                    data: monthlyData.map(m => m.balance),
                    borderColor: CHART_COLORS.gold,
                    backgroundColor: gradGold,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: CHART_COLORS.gold,
                    pointBorderColor: '#1a1a2e',
                    pointBorderWidth: 2
                },
                {
                    label: '購入額',
                    data: monthlyData.map(m => m.amount),
                    borderColor: CHART_COLORS.red,
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: CHART_COLORS.red
                },
                {
                    label: '払戻額',
                    data: monthlyData.map(m => m.payout),
                    borderColor: CHART_COLORS.green,
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: CHART_COLORS.green
                }
            ]
        },
        options: {
            ...defaultOptions,
            plugins: {
                ...defaultOptions.plugins,
                tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ¥${ctx.parsed.y.toLocaleString()}`
                    }
                }
            }
        }
    });
}

// --- グループ別棒グラフ ---
export function renderGroupBarChart(canvasId, groupData, labelKey = 'name') {
    destroyChart(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const gradRed = ctx.createLinearGradient(0, 0, 0, 400);
    gradRed.addColorStop(0, 'rgba(231, 76, 60, 0.8)');
    gradRed.addColorStop(1, 'rgba(231, 76, 60, 0.2)');

    const gradGreen = ctx.createLinearGradient(0, 0, 0, 400);
    gradGreen.addColorStop(0, 'rgba(39, 174, 96, 0.8)');
    gradGreen.addColorStop(1, 'rgba(39, 174, 96, 0.2)');

    const labels = groupData.map(g => g[labelKey]);
    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '購入額',
                    data: groupData.map(g => g.totalAmount),
                    backgroundColor: gradRed,
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: 6
                },
                {
                    label: '払戻額',
                    data: groupData.map(g => g.totalPayout),
                    backgroundColor: gradGreen,
                    borderColor: 'transparent',
                    borderWidth: 0,
                    borderRadius: 6
                }
            ]
        },
        options: {
            ...defaultOptions,
            plugins: {
                ...defaultOptions.plugins,
                tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ¥${ctx.parsed.y.toLocaleString()}`
                    }
                }
            }
        }
    });
}

// --- 回収率横棒グラフ ---
export function renderReturnRateChart(canvasId, groupData) {
    destroyChart(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    const gradGreen = ctx.createLinearGradient(0, 0, 400, 0);
    gradGreen.addColorStop(0, 'rgba(39, 174, 96, 0.3)');
    gradGreen.addColorStop(1, 'rgba(39, 174, 96, 0.9)');

    const gradRed = ctx.createLinearGradient(0, 0, 400, 0);
    gradRed.addColorStop(0, 'rgba(231, 76, 60, 0.3)');
    gradRed.addColorStop(1, 'rgba(231, 76, 60, 0.9)');

    const labels = groupData.map(g => g.name);
    const data = groupData.map(g => Math.round(g.returnRate * 10) / 10);

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '回収率 (%)',
                data,
                backgroundColor: data.map(v => v >= 100 ? gradGreen : gradRed),
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: 6
            }]
        },
        options: {
            ...defaultOptions,
            indexAxis: 'y',
            plugins: {
                ...defaultOptions.plugins,
                tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: {
                        label: (ctx) => `回収率: ${ctx.parsed.x}%`
                    }
                },
                annotation: {
                    annotations: {
                        line100: {
                            type: 'line',
                            xMin: 100, xMax: 100,
                            borderColor: CHART_COLORS.gold,
                            borderWidth: 2,
                            borderDash: [6, 4],
                            label: { content: '100%', display: true, color: CHART_COLORS.gold }
                        }
                    }
                }
            }
        }
    });
}

// --- 的中率ドーナツ ---
export function renderHitRateDonut(canvasId, hitCount, missCount) {
    destroyChart(canvasId);
    const ctx = getCtx(canvasId);
    if (!ctx) return;

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['的中', '不的中'],
            datasets: [{
                data: [hitCount, missCount],
                backgroundColor: [CHART_COLORS.green, 'rgba(255,255,255,0.08)'],
                borderColor: ['transparent', 'transparent'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...defaultOptions.plugins.tooltip,
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.parsed}件`
                    }
                }
            }
        }
    });
}

export function destroyAll() {
    Object.keys(chartInstances).forEach(destroyChart);
}
