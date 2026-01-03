// 讓 TypeScript 知道「Chart 來自全域變數」
declare const Chart: any;

// chartManager.ts
const chartRegistry: Record<string, any> = {};

/** 建立或覆蓋 Chart 實例 */
export function createOrUpdateChart(chartId: string, ctx: any, config: any) {
  if (chartRegistry[chartId]) {
    chartRegistry[chartId].destroy();
  }
  chartRegistry[chartId] = new Chart(ctx, config);
  return chartRegistry[chartId];
}

// appointmentsPage.ts
import { dataStore } from "../data/dataStore.js";
import type { AppointmentRecord } from "../data/schema.js";
import { generateAppointmentSuggestions } from "../logic/aiManager.js";
import { generateEstimation, formatDateLabel, EstimationData } from "../logic/forecast/appointmentForecast.js";

/* ============================
    初始化頁面
=============================== */
/* ============================
    初始化頁面
=============================== */
export function initAppointmentsPage() {
    console.log("initAppointmentsPage (appointments page loaded)");

    if (!dataStore.appointments.length) {
        console.warn("No appointments data.");
        // 如果沒有資料，也可以選染一個空的或提示
        return;
    }
    
    // Initial Render
    setupTrendRangeButtons();
    setupSeasonalSlider(); // 初始化滑桿
    renderAllCharts();

    // 監聽日期變更事件 (Global Date Change)
    window.addEventListener('dateChanged', () => {
        console.log("📆 Date changed detected in AppointmentsPage, refreshing charts...");
        renderAllCharts();
    });
}

function renderAllCharts() {
    renderTrendChart(currentRange); // 預設保留目前選擇的天數範圍
    renderShowRateChart();
    renderTimeDistributionChart();
    renderQualityChart();

    // Refreshed AI Suggestions
    const suggestions = generateAppointmentSuggestions(dataStore.appointments);
    renderAISuggestions(suggestions);
}


/* ===============================================
   1. 預約趨勢推估圖 — Canvas: apptTrendChart
   
   功能說明：
   - 整合歷史數據與未來排程，繪製 7/30/90 天的趨勢曲線。
   - 包含「實際預約」、「系統推估趨勢」與「情境模擬」三條曲線。
   
   注意：
   - 推估值基於加權模型運算，僅供營運參考，非絕對預測。
   =============================================== */

let trendChart: any = null;
let currentRange: number = 30; // 目前顯示的天數範圍
let currentSeasonalFactor: number = 0.2; // 季節性調節係數 (Seasonal Adjustment)
let cachedBaseData: EstimationData[] = []; // 快取基準運算數據 (Factor=0)

function renderTrendChart(range: number = 30) {
    currentRange = range; // 更新全域狀態
    const cvs = document.getElementById("apptTrendChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ apptTrendChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // 取得全域當前日期 (Dynamic Synchronization)
    const todayStr = (window as any).currentDate || "2025-12-16";
    const today = new Date(todayStr);
    
    // 1. 生成基準資料（不受旺季係數影響，factor = 0）
    cachedBaseData = generateEstimation(dataStore.appointments, today, range, 0);
    
    // 2. 建立 derived 預測資料（套用當前旺季係數）
    // 2. 建立 derived 預測資料（套用當前旺季係數 - 加權影響模型）
    const estimationData = applyWeightedModel(cachedBaseData, currentSeasonalFactor);
    
    // 準備圖表資料
    const labels = estimationData.map(d => formatDateLabel(d.date));
    
    // 實際預約資料（所有狀態）
    const actualData = estimationData.map(d => d.actual !== undefined ? d.actual : null);
    
    // 推估趨勢（對已有資料的推估）
    const trendData = estimationData.map(d => d.estimatedTrend !== undefined ? d.estimatedTrend : null);
    
    // 未來推估
    const estimatedData = estimationData.map(d => d.estimated !== undefined ? d.estimated : null);

    // 若已存在舊圖表 → destroy
    if (trendChart) trendChart.destroy();

    trendChart = createOrUpdateChart("apptTrendChart", ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "實際預約",
                    data: actualData,
                    borderColor: "#4A90E2",
                    backgroundColor: "rgba(74, 144, 226, 0.1)",
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    order: 1
                },
                {
                    label: "推估趨勢（參考）",
                    data: trendData,
                    borderColor: "#FFA500",
                    backgroundColor: "rgba(255, 165, 0, 0.05)",
                    tension: 0.4,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointStyle: 'triangle',
                    fill: false,
                    order: 2
                },
                {
                    label: "情境推估",
                    data: estimatedData,
                    borderColor: "#9B59B6",
                    backgroundColor: "rgba(155, 89, 182, 0.05)",
                    tension: 0.4,
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointStyle: 'circle',
                    fill: false,
                    order: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '⚠️ 推估值非實際預測，僅供營運評估參考',
                    font: {
                        family: "'Noto Sans TC', sans-serif",
                        size: 11,
                        weight: 'normal'
                    },
                    color: '#666',
                    padding: {
                        top: 5,
                        bottom: 10
                    }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            family: "'Noto Sans TC', sans-serif",
                            size: 12
                        },
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(context: any) {
                            return context[0].label;
                        },
                        label: function(context: any) {
                            const value = context.parsed.y;
                            if (value === null) return null;
                            
                            const datasetLabel = context.dataset.label;
                            return `${datasetLabel}: ${value} 筆預約`;
                        },
                        footer: function(context: any) {
                            const index = context[0].dataIndex;
                            const data = estimationData[index];
                            
                            if (data.explanation) {
                                return data.explanation;
                            }
                            return '';
                        }
                    },
                    titleFont: {
                        family: "'Noto Sans TC', sans-serif"
                    },
                    bodyFont: {
                        family: "'Noto Sans TC', sans-serif"
                    },
                    footerFont: {
                        family: "'Noto Sans TC', sans-serif",
                        size: 10,
                        style: 'italic'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: {
                            family: "'Noto Sans TC', sans-serif"
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            family: "'Noto Sans TC', sans-serif"
                        },
                        callback: function(value: any) {
                            return value + ' 筆';
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });

    console.log(`[TrendChart] 已渲染未來 ${range} 天推估`);
}

/* ===============================================
   2. 到診率與爽約分析 — Canvas: apptShowRateChart
   
   功能說明：
   - 統計特定期間內的預約履行狀況。
   - 分為「實際到診 (Show)」與「爽約 (No-show)」比例。
   - 排除狀態：已取消 (Cancelled) 與未來預約。
   =============================================== */
function renderShowRateChart() {
    const cvs = document.getElementById("apptShowRateChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ apptShowRateChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    let show = 0;
    let noShow = 0;

    // 基準日期：2025-12-16
    const today = new Date("2025-12-16");

    dataStore.appointments.forEach(a => {
        const d = new Date(a.date);
        
        // 排除未來日期 (嚴格大於 today)
        // 注意：這裡假設 date 是 YYYY-MM-DD，new Date(date) 會是 UTC 00:00，
        // 而 we treat today as 2025-12-16.
        // 簡單比較 getTime() 即可。
        if (d.getTime() > today.getTime()) return;

        // 排除已取消
        if (a.status === "cancelled") return;

        if (a.status === "completed") show++;
        else if (a.status === "no_show") noShow++;
    });

    const total = show + noShow;
    
    // 計算百分比
    const showPct = total > 0 ? Math.round((show / total) * 100) : 0;
    const noShowPct = total > 0 ? Math.round((noShow / total) * 100) : 0;

    createOrUpdateChart("apptShowRateChart", ctx, {
  type: "pie",
  data: {
    labels: ["到診", "No-show"],
    datasets: [{
      data: [show, noShow],
      backgroundColor: ["#4CAF50", "#FF5252"],
      borderWidth: 2,
      borderColor: "#ffffff"
    }]
  },
    options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 0,
                    bottom: 30, // 增加底部 padding 給小字
                    left: 0,
                    right: 0
                }
            },
            plugins: {
                legend: {
                    position: 'right', // 改到右側減少空曠感
                    align: 'center',
                    labels: {
                        boxWidth: 15,
                        padding: 20,
                        font: {
                            family: "'Noto Sans TC', sans-serif",
                            size: 13,
                            weight: 'bold'
                        },
                        // 自訂 Legend 顯示格式: "標籤: XX% (XX筆)"
                        generateLabels: (chart: any) => {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label: string, i: number) => {
                                    const value = data.datasets[0].data[i];
                                    const meta = chart.getDatasetMeta(0);
                                    const style = meta.controller.getStyle(i);
                                    const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                                    
                                    return {
                                        text: `${label} : ${percent}% (${value})`,
                                        fillStyle: style.backgroundColor,
                                        strokeStyle: style.borderColor,
                                        lineWidth: style.borderWidth,
                                        hidden: isNaN(value) || meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context: any) {
                            const value = context.parsed;
                            const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                            return ` ${context.label}: ${value}筆 (${percent}%)`;
                        }
                    },
                    bodyFont: {
                        size: 14
                    }
                }
            }
        }
    });

    // 動態加入小字 (避免重複添加)
    const container = cvs.parentElement;
    if (container) {
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        let note = container.querySelector(".chart-note") as HTMLElement;
        if (!note) {
            note = document.createElement("div");
            note.className = "chart-note";
            note.style.textAlign = "center";
            note.style.fontSize = "0.75rem"; // smaller text
            note.style.color = "#888"; // gray text
            
            // 使用 absolute positioning 避免被切到
            note.style.position = "absolute";
            note.style.bottom = "5px";
            note.style.width = "100%";
            note.style.left = "0";
            
            container.appendChild(note);
        }
        note.innerText = "到診率僅統計已完成預約（不含未來與取消）";
    }
}
/* ===============================================
   3. 預約時段分布 — canvas: apptTimeDistChart
   =============================================== */
/* ===============================================
   3. 熱門時段分佈分析 — Canvas: apptTimeDistChart
     (Daily Relative Load Analysis)

   功能說明：
   - 分析今日 (Today) 各小時的預約密度 (12:00 - 20:00)。
   - 透過紅/橘/綠燈號，直觀顯示時段擁擠程度。
   - 協助櫃台人員進行顧客分流與現場人力調度。
   =============================================== */
function renderTimeDistributionChart() {
    const cvs = document.getElementById("apptTimeDistChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ apptTimeDistChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    
    // 1. 設定基準日 (Today)
    const todayStr = (window as any).currentDate || new Date().toISOString().split('T')[0];

    // 2. 初始化統計 (設定營業時間 12:00 - 20:00, 20:00涵蓋至20:59)
    const startHour = 12;
    const endHour = 20;
    const totalSlots = endHour - startHour + 1;
    const labels = [];
    for(let h=startHour; h<=endHour; h++) labels.push(`${h}:00`);

    const todayCounts = new Array(totalSlots).fill(0);

    // 3. 只統計今日數據
    dataStore.appointments.forEach(a => {
        if (a.status === "cancelled") return;
        const dateStr = a.date.slice(0, 10);
        if (dateStr !== todayStr) return; // Ignore history

        // 計算規則: 12:00~12:59 -> 12點 (Floor)
        const h = parseInt(a.time.split(":")[0], 10);
        
        // 過濾非營業時間
        if (h < startHour || h > endHour) return;
        
        todayCounts[h - startHour]++;
    });

    // 4. 當日相對比較邏輯 (Daily Rank)
    // 找出最大值與次大值
    // 若最大值 < 3 (樣本太少)，全綠
    const maxVal = Math.max(...todayCounts);
    
    // 建立 (value, originalIndex) 列表以便排序
    const ranked = todayCounts.map((v, i) => ({ val: v, idx: i }));
    ranked.sort((a, b) => b.val - a.val); // Desc

    const peakVal = ranked[0].val;
    const runnerUpVal = ranked.find(x => x.val < peakVal)?.val || -1; // Find first value strictly less than peak

    const bgColors = new Array(totalSlots).fill("#10b981"); // Default Green
    const statusLabelData = new Array(totalSlots).fill("");

    if (peakVal >= 3) {
        todayCounts.forEach((val, i) => {
            if (val === peakVal) {
                bgColors[i] = "#ef4444"; // Red
                statusLabelData[i] = "今日最高";
            } else if (val === runnerUpVal && val >= 3) {
                // 次高必須也 >= 3 才算忙，否則只是 "相對" 忙但其實很閒
                bgColors[i] = "#f97316"; // Orange
                statusLabelData[i] = "次高";
            } else {
                bgColors[i] = "#10b981"; // Green
            }
        });
    }

    createOrUpdateChart("apptTimeDistChart", ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    data: todayCounts,
                    backgroundColor: bgColors,
                    borderRadius: 4,
                    borderSkipped: false,
                    barPercentage: 0.6,
                    hoverBackgroundColor: bgColors
                }
            ]
        },
        options: {
            indexAxis: 'x', // Vertical
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 30, bottom: 10 }
            },
            scales: {
                x: {
                    display: true,
                    grid: { display: false },
                    ticks: {
                        color: "#64748b",
                        font: { family: "'Noto Sans TC', sans-serif", size: 12, weight: 'bold' }
                    }
                },
                y: {
                    display: false,
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    callbacks: {
                        title: (ctx: any) => ctx[0].label,
                        label: (ctx: any) => `${ctx.raw} 人預約`
                    }
                }
            }
        },
        plugins: [{
            id: 'relativeLabels',
            afterDatasetsDraw: (chart: any) => {
                const { ctx, scales: { x, y } } = chart;
                ctx.save();
                ctx.font = 'bold 12px "Noto Sans TC", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                
                statusLabelData.forEach((label, i) => {
                    if (!label) return;
                    const xPos = x.getPixelForTick(i);
                    const yPos = y.getPixelForValue(todayCounts[i]) - 5;
                    
                    if (label === '今日最高') ctx.fillStyle = '#ef4444';
                    else if (label === '次高') ctx.fillStyle = '#f97316';
                    
                    ctx.fillText(label, xPos, yPos);
                });
                ctx.restore();
            }
        }]
    });

    // Footer
    const container = cvs.parentElement;
    if (container) {
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        let note = container.querySelector(".chart-footer-note") as HTMLElement;
        if (!note) {
            note = document.createElement("div");
            note.className = "chart-footer-note";
            note.style.position = "absolute";
            note.style.bottom = "0";
            note.style.left = "0";
            note.style.width = "100%";
            note.style.textAlign = "center";
            note.style.fontSize = "0.7rem";
            note.style.color = "#cbd5e1";
            note.style.pointerEvents = "none";
            container.appendChild(note);
        }
        note.innerText = "";
    }
}

/* ===============================================
   4. 預約品質結構分析 — Canvas: bookingQualityChart
   
   功能說明：
   - 將歷史預約依據「營收貢獻」與「信用風險」進行分群。
   - 分類標準：
     1. 高價值 (High Value): 高單價療程或高頻回診客。
     2. 高風險 (High Risk): 曾有 No-show 紀錄或 Cancellations。
     3. 一般 (Normal): 標準預約。
   =============================================== */
function renderQualityChart() {
    const cvs = document.getElementById("bookingQualityChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ bookingQualityChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    
    // 1. 設定基準日與篩選範圍 (僅過去資料)
    const today = new Date("2025-12-17"); // 根據需求固定時間
    const pastAppointments = dataStore.appointments.filter(a => {
        const d = new Date(a.date);
        // 只統計發生過或當日的預約 (<= 2025-12-17)
        return d <= today; 
    });

    if (pastAppointments.length === 0) return;

    // 2. 準備輔助資料 (Services Price & Customer Stats)
    const servicePriceMap = new Map<string, number>();
    dataStore.services.forEach(s => servicePriceMap.set(s.service_name, s.price));

    // 計算平均單價 (僅計算有價格的療程預約)
    let totalRevenue = 0;
    let pricedCount = 0;
    
    // 計算顧客歷史狀態 (completed, no_show, total)
    const customerStats = new Map<string, { completed: number, no_show: number, total: number }>();

    // 先跑一次 Loop 建立這些統計資料
    pastAppointments.forEach(a => {
        // Price
        const price = servicePriceMap.get(a.service_item);
        if (price !== undefined) {
            totalRevenue += price;
            pricedCount++;
        }

        // Stats
        if (!customerStats.has(a.customer_id)) {
            customerStats.set(a.customer_id, { completed: 0, no_show: 0, total: 0 });
        }
        const stats = customerStats.get(a.customer_id)!;
        stats.total++;
        if (a.status === 'completed') stats.completed++;
        else if (a.status === 'no_show') stats.no_show++;
    });

    const avgPrice = pricedCount > 0 ? totalRevenue / pricedCount : 0;

    // 3. 分類計算 (高風險 > 高價值 > 一般)
    let countHighRisk = 0;
    let countHighValue = 0;
    let countNormal = 0;

    pastAppointments.forEach(a => {
        const stats = customerStats.get(a.customer_id) || { completed: 0, no_show: 0, total: 0 };
        const price = servicePriceMap.get(a.service_item) || 0;
        const noShowRate = stats.total > 0 ? stats.no_show / stats.total : 0;

        // Condition A: High Risk
        // 1. 本身狀態異常 (no_show / cancelled)
        // 2. 顧客習慣性 No-show (> 30%)
        const isHighRisk = (a.status === 'no_show' || a.status === 'cancelled') || (noShowRate > 0.3);

        // Condition B: High Value
        // 1. 單價 > 平均單價
        // 2. 回診客 (completed >= 2)
        const isHighValue = (price > avgPrice) || (stats.completed >= 2);

        if (isHighRisk) {
            countHighRisk++;
        } else if (isHighValue) {
            countHighValue++;
        } else {
            countNormal++;
        }
    });

    // 4. 計算佔比
    const totalClassified = countHighRisk + countHighValue + countNormal;

    createOrUpdateChart("bookingQualityChart", ctx, {
        type: "doughnut",
        data: {
            labels: ["高價值", "一般", "高風險"],
            datasets: [{
                data: [countHighValue, countNormal, countHighRisk],
                backgroundColor: ["#FFD700", "#4BC0C0", "#FF4500"],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    bottom: 40, // 增加底部空間給 HTML 文字
                    top: 10
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '預約品質分布',
                    font: { size: 16, weight: 'bold', family: "'Noto Sans TC', sans-serif" },
                    padding: { bottom: 5 }
                },
                // 移除 canvas subtitle，改用 HTML 呈現以提升閱讀性
                legend: {
                    position: 'right', 
                    labels: {
                        font: { family: "'Noto Sans TC', sans-serif", size: 11 },
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context: any) {
                            const val = context.parsed;
                            const pct = totalClassified > 0 ? Math.round((val / totalClassified) * 100) : 0;
                            return ` ${context.label}: ${val}筆 (${pct}%)`;
                        }
                    },
                    bodyFont: {
                        family: "'Noto Sans TC', sans-serif"
                    }
                }
            },
            cutout: '70%'
        }
    });

    // 動態加入說明文字 (HTML 結構比 canvas 文字更好讀)
    const container = cvs.parentElement;
    if (container) {
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        let note = container.querySelector(".quality-chart-note") as HTMLElement;
        if (!note) {
            note = document.createElement("div");
            note.className = "quality-chart-note";
            // 樣式設定
            note.style.position = "absolute";
            note.style.bottom = "0";
            note.style.left = "0";
            note.style.width = "100%";
            note.style.padding = "5px 10px";
            note.style.fontSize = "0.75rem";
            note.style.color = "#555"; // 加深顏色
            note.style.lineHeight = "1.4";
            note.style.textAlign = "center";
            note.style.backgroundColor = "rgba(255,255,255,0.8)"; // 確保背景清晰
            note.style.borderTop = "1px solid #eee";
            
            container.appendChild(note);
        }
        
        // 使用 HTML 排版
        note.innerHTML = `
            <div style="display: flex; justify-content: center; gap: 15px;">
                <span><b style="color:#d4af37">高價值</b>：高營收或熟客</span>
                <span><b style="color:#FF4500">高風險</b>：取消/No-show或高風險客群</span>
            </div>
        `;
    }
}

function setupTrendRangeButtons() {
    const buttons = document.querySelectorAll<HTMLButtonElement>(
        ".trend-range-selector button"
      );

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            const range = Number(btn.dataset.range);
            currentRange = range; // 更新全域狀態
            
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            renderTrendChart(range);
        });
    });
}

function setupSeasonalSlider() {
    const slider = document.getElementById("seasonalSlider") as HTMLInputElement;
    const valueDisplay = document.getElementById("seasonalValue");
    
    if (!slider || !valueDisplay) return;

    slider.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        const navValue = parseFloat(target.value);
        currentSeasonalFactor = navValue;
        
        // 更新顯示文字
        const percent = Math.round(navValue * 100);
        const sign = percent >= 0 ? "+" : "";
        valueDisplay.textContent = `${sign}${percent}%`;
        valueDisplay.style.color = percent >= 0 ? "var(--primary-color)" : "#e74c3c"; // 正數綠色，負數紅色

        // 如果圖表存在且有快取資料，只更新數據不重新 mount
        if (trendChart && cachedBaseData.length > 0) {
             // 建立 derived 預測資料（套用當前旺季係數）
             // 建立 derived 預測資料（套用加權影響模型）
             const estimationData = applyWeightedModel(cachedBaseData, currentSeasonalFactor);
             
             // 提取新數據
             // trendData (index 1): 基準趨勢 (estimatedTrend)，保持不變或受基準影響
             // estimatedData (index 2): 情境推估 (estimated)，受係數影響
             
             const trendData = estimationData.map(d => d.estimatedTrend !== undefined ? d.estimatedTrend : null);
             const estimatedData = estimationData.map(d => d.estimated !== undefined ? d.estimated : null);
             
             // 更新 datasets (index 1 = 推估趨勢, index 2 = 情境推估)
             trendChart.data.datasets[1].data = trendData;
             trendChart.data.datasets[2].data = estimatedData;
             
             // 使用 'none' 模式禁用動畫，實現即時跟隨效果
             trendChart.update("none");
        }
    });
}

function renderAISuggestions(suggestions: string[]) {
    const container = document.getElementById("appt-ai-suggestions-container");
    if (!container) return;

    container.innerHTML = suggestions
        .map(text => {
            // 偵測是否以 Emoji 開頭
            const emojiMatch = text.match(/^(⚠️|ℹ️|✅|📈|💡|🔥|🌟|📉)\s?/);
            let icon = "";
            let displayText = text;

            if (emojiMatch) {
                icon = emojiMatch[1];
                displayText = text.replace(emojiMatch[0], ""); // 移除 Emoji 與空格
            } else {
                icon = pickIcon(text);
            }

            const iconColor = getIconColor(icon);

            return `
                <div class="ai-card">
                    <div class="ai-icon" style="color: ${iconColor}; font-size: 1.2rem;">${icon}</div>
                    <div class="ai-text">${displayText}</div>
                </div>
            `;
        })
        .join("");
}

function getIconColor(icon: string): string {
    // High Risk / Warning -> Deep Orange/Red
    if (/^(🔥|⚠️|🔴|📉)$/.test(icon)) return "#FF4500";
    
    // Info / Neutral -> Blue
    if (/^(ℹ️|💡|🔵|🤖|🌙)$/.test(icon)) return "#3b82f6";
    
    // Positive / Growth -> Green
    if (/^(✅|📈|🌟)$/.test(icon)) return "#10b981";
    
    // Service / Others -> Purple or Gray
    if (/^(💆‍♀️)$/.test(icon)) return "#8b5cf6";

    return "#64748b"; // Default Gray
}

function pickIcon(text: string): string {
    if (/no.?show|未到/i.test(text)) return "⚠️";
    if (/高峰|尖峰|peak/i.test(text)) return "�";
    if (/熱門|療程|service/i.test(text)) return "🌟"; // Changed to Star for popular
    if (/低|離峰|low/i.test(text)) return "🌙";
    if (/建議|建議/i.test(text)) return "💡";
    return "🤖"; // default
}

/* ============================
    讓 pageController 可呼叫
=============================== */
(window as any).initAppointmentsPage = initAppointmentsPage;
const suggestions = generateAppointmentSuggestions([]); 
// Top-level execution removed to avoid race condition.
// Logic moved to initAppointmentsPage.

/**
 * 加權影響模型 (Weighted Impact Model) for Forecast
 * 
 * 運算邏輯：
 * forecast[t] = baseForecast[t] * (1 + sliderValue * dayWeight[t])
 * 
 * 權重設定 (Day Weights):
 * - 週五 (Fri): 1.1 (小週末效應)
 * - 週末 (Sat/Sun): 1.2 (假日高峰)
 * - 平日 (Mon-Thu): 0.9 (常態分佈)
 */
function applyWeightedModel(baseData: EstimationData[], sliderValue: number): EstimationData[] {
    return baseData.map(d => {
        const newItem = { ...d };
        
        let dayWeight = 0.9; // Default Mon-Thu
        const dayOfWeek = d.dayOfWeek !== undefined ? d.dayOfWeek : new Date(d.date).getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) { // Sun or Sat
            dayWeight = 1.2;
        } else if (dayOfWeek === 5) { // Fri
            dayWeight = 1.1;
        }

        const multiplier = 1 + sliderValue * dayWeight;

        // 1. 未來推估
        if (newItem.estimated !== undefined) {
            newItem.estimated = Math.round(newItem.estimated * multiplier);
        }
        
        // 2. 推估趨勢
        if (newItem.estimatedTrend !== undefined) {
            newItem.estimatedTrend = Math.round(newItem.estimatedTrend * multiplier);
        }
        
        return newItem;
    });
}
