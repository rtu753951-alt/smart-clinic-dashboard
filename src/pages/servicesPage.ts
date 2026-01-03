// =====================================================
//  Services Page — Month Switching (Final Fixed Version)
// =====================================================

import { updateServiceAISummary, generateServiceSuggestions } from "../logic/aiManager.js";
import { dataStore } from "../data/dataStore.js";

declare const Chart: any;

let currentServicesData: any = null; // Cache for current month data

// -----------------------
// 工具：格式化金額
// -----------------------
function formatCurrency(n: number): string {
  if (!n || isNaN(n)) return "--";
  return "NT$" + Math.round(n).toLocaleString("zh-TW");
}

// -----------------------
// Helper: Get Daily Top Treatment
// -----------------------
function getDailyTopTreatmentMap(appointments: any[]) {
    const dailyMap: Record<string, Record<string, number>> = {};
    const serviceMap = buildServiceMap(dataStore.services);

    appointments.forEach(apt => {
        if (!["completed", "checked_in", "no_show", "cancelled"].includes(apt.status)) return;
        
        const items = (apt.service_item || "").split(";").map((s:string) => s.trim()).filter(Boolean);
        items.forEach((item: string) => {
            const price = serviceMap.get(item)?.price || 0;
            if (price > 0) {
                if (!dailyMap[apt.date]) dailyMap[apt.date] = {};
                dailyMap[apt.date][item] = (dailyMap[apt.date][item] || 0) + price;
            }
        });
    });

    const result: Record<string, {name: string, amount: number}> = {};
    Object.keys(dailyMap).forEach(date => {
        const services = dailyMap[date];
        const sorted = Object.entries(services).sort((a,b) => b[1] - a[1]);
        if (sorted.length > 0) {
            result[date] = { name: sorted[0][0], amount: sorted[0][1] };
        }
    });
    return result;
}

// -----------------------
// 工具：是否在指定月份
// -----------------------
function isInMonth(dateStr: string, year: number, month: number): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === year && d.getMonth() === month;
}

// -----------------------
// 建立 Service Map
// -----------------------
function buildServiceMap(services: any[]) {
  // 安全防護：避免 services 尚未載入時直接呼叫 forEach
  if (!Array.isArray(services)) {
    console.warn("[Services] buildServiceMap: services is not array", services);
    return new Map();
  }

  const map = new Map();
  services.forEach(s => {
    const name = (s.service_name || "").trim();
    if (!name) return;
    map.set(name, {
      price: Number(s.price) || 0,
      category: s.category || "其他"
    });
  });
  return map;
}


// ------------------------------------------------------
// ⭐ 新版 computeRevenue — 加入 targetYear / targetMonth
// ------------------------------------------------------
// ------------------------------------------------------
// ⭐ 新版 computeRevenue — 加入 targetYear / targetMonth
// ------------------------------------------------------
function computeRevenue(
  appointments: any[],
  services: any[],
  targetYear: number,
  targetMonth: number
) {
  const serviceMap = buildServiceMap(services);

  // 基準日期：2025-12-17
  const cutoffDate = new Date("2025-12-17T23:59:59"); // 當天算過去

  let totalRevenue = 0;
  let orderCount = 0;
  let potentialVisitCount = 0;
  let successVisitCount = 0;
  let hasFutureContribution = false; // 是否包含未來預估

  const dailyRevenue: Record<string, number> = {};
  const serviceRevenue: Record<string, number> = {};
  const categoryRevenue: Record<string, number> = {};

  appointments.forEach(a => {
    if (!isInMonth(a.date, targetYear, targetMonth)) return;

    const d = new Date(a.date);
    const isFuture = d > cutoffDate;

    // 判斷是否計入營收
    let shouldIncludeRevenue = false;

    if (isFuture) {
        // 未來：completed + no_show + cancelled
        // (含 cancelled/no_show 代表計算"原本預期會有的營收")
        if (["completed", "checked_in", "no_show", "cancelled"].includes(a.status)) {
            shouldIncludeRevenue = true;
            hasFutureContribution = true;
        }
    } else {
        // 過去 (含今天)：僅 completed
        if (["completed", "checked_in"].includes(a.status)) {
            shouldIncludeRevenue = true;
        }
    }

    // 計算轉換率分母 (Potential)
    // 這裡維持原邏輯：Completed / Checked_in / Booked 都算 Potential
    const status = a.status;
    const isCompleted = status === "completed" || status === "checked_in";
    const isPotential = isCompleted || status === "booked";
    if (isPotential) potentialVisitCount++;
    if (isCompleted) successVisitCount++; // 轉換率分子維持只看真正完成的

    // 若不計入營收，就跳過金額計算
    if (!shouldIncludeRevenue) return;

    const items: string[] = (a.service_item || "")
         .split(";")
         .map((s: string) => s.trim())
         .filter(Boolean);


    let sum = 0;

    items.forEach((name: string) => {
      const info = serviceMap.get(name);
      const price = info ? Number(info.price) : 0;
      const category = info ? (info.category || "其他") : "其他";
      
      sum += price;

      if (!serviceRevenue[name]) serviceRevenue[name] = 0;
      serviceRevenue[name] += price;
      
      if (!categoryRevenue[category]) categoryRevenue[category] = 0;
      categoryRevenue[category] += price;
    });
 
    if (sum > 0) {
      totalRevenue += sum;
      orderCount++;
      // 注意：successVisitCount 用於轉換率，這裡 orderCount 用於客單價
      // 因為未來 cancelled 沒真正完成，但我們這裡算進營收，所以也算進訂單數合理

      if (!dailyRevenue[a.date]) dailyRevenue[a.date] = 0;
      dailyRevenue[a.date] += sum;
    }
  });
  

  const avgOrderValue = orderCount === 0 ? 0 : totalRevenue / orderCount;
  const conversionRate =
    potentialVisitCount === 0
      ? 0
      : Math.round((successVisitCount / potentialVisitCount) * 100);

  return {
    monthLabel: `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`,
    totalRevenue,
    avgOrderValue,
    conversionRate,
    dailyRevenue,
    serviceRevenue,
    categoryRevenue,
    hasFutureContribution
  };
}

// -----------------------------
// UI — 更新 KPI
// -----------------------------
function renderKPI(data: any) {
  // 1. 本月營收
  const elRevenue = document.getElementById("srv-revenue");
  if (elRevenue) {
      let html = `${formatCurrency(data.totalRevenue)} <span style="font-size:0.6em; color:#888;">(${data.monthLabel})</span>`;
      
      // 如果包含未來預估，加上 (預估) 小字
      if (data.hasFutureContribution) {
          html += ` <span style="font-size:0.75rem; color:#f39c12; font-weight:normal;">(預估)</span>`;
      }
      
      elRevenue.innerHTML = html;
  }

  // 2. 客單價
  const elAOV = document.getElementById("srv-aov");
  if (elAOV) {
      elAOV.textContent = formatCurrency(data.avgOrderValue);
  }

  // 3. 月營收成長率 (MoM)
  const elMoM = document.getElementById("srv-mom");
  const elTitle = document.getElementById("srv-mom-title");
  const elSubtitle = document.getElementById("srv-mom-subtitle");
  const elTag = document.getElementById("srv-mom-tag");
  const elNote = document.getElementById("srv-mom-note");

  // 更新標題與狀態
  if (data.hasFutureContribution) {
      if (elTitle) elTitle.textContent = "月營收成長率（預估）";
      if (elSubtitle) elSubtitle.textContent = "MoM Revenue Growth (Estimated)";
      if (elTag) elTag.style.display = "block";
      if (elNote) elNote.textContent = "本月為預估營收，包含未來已排程療程";
  } else {
      if (elTitle) elTitle.textContent = "月營收成長率";
      if (elSubtitle) elSubtitle.textContent = "MoM Revenue Growth";
      if (elTag) elTag.style.display = "none";
      if (elNote) elNote.textContent = "";
  }

  // 更新數值
  if (elMoM) {
      const mom = data.mom; // number percentage
      if (mom === null || mom === undefined || !isFinite(mom)) {
          elMoM.innerHTML = `<span style="color:#aaa;">--</span>`;
      } else {
          const isPositive = mom >= 0;
          const color = isPositive ? "#10b981" : "#ef4444"; // Green : Red
          const icon = isPositive ? "▲" : "▼";
          const sign = isPositive ? "+" : "";
          
          elMoM.innerHTML = `
            <span style="color: ${color}; font-weight: bold;">
                ${icon} ${sign}${mom.toFixed(1)}%
            </span>
          `;
      }
  }
}

// -----------------------------
// UI — AI Summary
// -----------------------------
function buildAISummary(data: any) {
    const estimateNote = data.hasFutureContribution ? "(含未來預估)" : "";
    
    let momText = "N/A";
    if (data.mom !== null && data.mom !== undefined && isFinite(data.mom)) {
        const sign = data.mom >= 0 ? "+" : "";
        momText = `${sign}${data.mom.toFixed(1)}%`;
    }

  return `
📆 月份：${data.monthLabel}
💰 營收：${formatCurrency(data.totalRevenue)} ${estimateNote}
📊 MoM成長：${momText}
🧾 客單價：${formatCurrency(data.avgOrderValue)}
`;
}

// -----------------------------
// ⭐ 核心：刷新頁面（切換月份時用）
// -----------------------------
export function refreshServicesPage(targetYM: string) {
  console.log("[Services] Refresh Services Page for:", targetYM);

  const [yearStr, monthStr] = targetYM.split("-");
  const targetYear = Number(yearStr);
  const targetMonth = Number(monthStr) - 1;

  const appts = dataStore.appointments;
  const services = dataStore.services;

  // 1. 計算當月
  const currentResults = computeRevenue(appts, services, targetYear, targetMonth);

  // 2. 計算上個月 (MoM 用)
  // JS Date 自動處理月份回推 (Month 0 - 1 = Previous Year Month 11)
  const prevDate = new Date(targetYear, targetMonth - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();
  const prevResults = computeRevenue(appts, services, prevYear, prevMonth);

  // 3. 計算 MoM
  let mom = 0;
  if (prevResults.totalRevenue > 0) {
      mom = ((currentResults.totalRevenue - prevResults.totalRevenue) / prevResults.totalRevenue) * 100;
  } else if (currentResults.totalRevenue > 0) {
      // 從 0 變有，視為 100% 成長 (First month or previous empty)
      mom = 100; 
  } else {
      // 0 -> 0
      mom = 0; 
  }

  const finalData = {
      ...currentResults,
      mom: mom,
      prevRevenue: prevResults.totalRevenue,
      targetYear,
      targetMonth,
      dailyTopTreatments: getDailyTopTreatmentMap(appts) // Add this new data
  };

  currentServicesData = finalData; // Cache for toggle

  // Reset toggle UI to 'Month'
  const btnMonth = document.getElementById("srv-struct-btn-month");
  const btnAll = document.getElementById("srv-struct-btn-all");
  const noteEl = document.getElementById("service-structure-note");

  if (btnMonth) btnMonth.classList.add("active");
  if (btnAll) btnAll.classList.remove("active");
  if (noteEl) noteEl.textContent = "顯示所選月份之已完成療程營收結構（不含取消與未到診）";

  renderKPI(finalData);
  renderRevenueChart(finalData);
  renderServiceStructureChart(finalData.categoryRevenue, finalData.monthLabel);

  const aiText = buildAISummary(finalData);
  updateServiceAISummary(aiText);

  // New: Update One-Sentence AI Suggestion
  const suggestion = generateServiceSuggestions(finalData);
  const suggestionBox = document.getElementById("srv-ai-suggestions");
  if (suggestionBox) {
      suggestionBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 1.1rem; font-weight: bold; color: #2c3e50;">${suggestion}</div>
        </div>
      `;
  }
}

// -----------------------------
// UI — 營收折線圖 (Daily Revenue Trend)
// -----------------------------
let revenueChart: any = null;

function renderRevenueChart(data: any) {
    const cvs = document.getElementById("srvRevenueChart") as HTMLCanvasElement;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // 1. 準備日期資料
    const year = data.targetYear;
    const month = data.targetMonth; // 0-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const labels: string[] = [];
    const values: number[] = [];
    
    // 基準日期 (String compare is safer for "YYYY-MM-DD")
    const cutoffDateStr = "2025-12-17";

    for (let d = 1; d <= daysInMonth; d++) {
        // Format: YYYY-MM-DD
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        labels.push(dateStr);
        values.push(data.dailyRevenue[dateStr] || 0);
    }
    
    // 2. 設定 Segment 樣式 (實線 vs 虛線)
    const segmentStyle = {
        borderDash: (ctx: any) => {
            const dateStr = labels[ctx.p1DataIndex];
            if (dateStr > cutoffDateStr) return [6, 6]; // Dashed
            return undefined; // Solid
        },
        borderColor: (ctx: any) => {
             const dateStr = labels[ctx.p1DataIndex];
             if (dateStr > cutoffDateStr) return "#f39c12"; // Orange for estimated
             return "#10b981"; // Primary Green for actual
        }
    };

    // 3. 銷毀舊圖表
    if (revenueChart) {
        revenueChart.destroy();
    }

    // 4. 建立新圖表
    revenueChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "每日營收",
                data: values,
                fill: true,
                backgroundColor: (context: any) => {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) return null;
                    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, "rgba(16, 185, 129, 0.05)");
                    gradient.addColorStop(1, "rgba(16, 185, 129, 0.2)");
                    return gradient;
                },
                borderColor: "#10b981", // default color
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 6,
                segment: segmentStyle 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(50, 50, 50, 0.9)', // Darker background
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    titleFont: { family: "'Noto Sans TC', sans-serif", size: 14 },
                    bodyFont: { family: "'Noto Sans TC', sans-serif", size: 13 },
                    callbacks: {
                        title: function(context: any) {
                            const dateStr = context[0].label;
                            const d = new Date(dateStr);
                            const dayOfWeek = d.getDay();
                            const dayNames = ["(日)", "(一)", "(二)", "(三)", "(四)", "(五)", "(六)"];
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            
                            let title = `${dateStr} ${dayNames[dayOfWeek]}`;
                            if (isWeekend) {
                                title += " ★週末";
                            }
                            // cutoffDateStr is defined in the outer scope of renderRevenueChart
                            if (dateStr > "2025-12-17") { 
                                title += " (預估)";
                            }
                            return title;
                        },
                        label: function(context: any) {
                            return `💰 營收: ${formatCurrency(context.parsed.y)}`;
                        },
                        afterBody: function(context: any) {
                            const dateStr = context[0].label;
                            const topItem = data.dailyTopTreatments ? data.dailyTopTreatments[dateStr] : null;
                            if (topItem) {
                                return `👑 Top 1: ${topItem.name} (${formatCurrency(topItem.amount)})`;
                            }
                            return [];
                        }
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#4b5563', // Darker text
                        font: { family: "'Inter', sans-serif", size: 11, weight: 500 },
                        maxTicksLimit: 10,
                    },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#4b5563', // Darker text
                        callback: (v: any) => {
                            if (v >= 10000) return (v / 10000).toFixed(0) + "萬";
                            return v;
                        },
                        font: { family: "'Inter', sans-serif", size: 11, weight: 500 }
                    }
                }
            }
        }
    } as any);
}

// -----------------------------
// Helper: 計算歷史累積結構
// -----------------------------
// -----------------------------
function computeAllTimeServiceStructure() {
    const appts = dataStore.appointments;
    const services = dataStore.services;
    const serviceMap = buildServiceMap(services);
    const categoryRevenue: Record<string, number> = {};

    appts.forEach(a => {
        // 歷史累積：僅 status = completed
        if (a.status !== "completed") return;

        const items: string[] = (a.service_item || "")
            .split(";")
            .map((s: string) => s.trim())
            .filter(Boolean);

        items.forEach((name: string) => {
            const info = serviceMap.get(name);
            const price = info ? Number(info.price) : 0;
            const category = info ? (info.category || "其他") : "其他";

            if (!categoryRevenue[category]) categoryRevenue[category] = 0;
            categoryRevenue[category] += price;
        });
    });

    return categoryRevenue;
}

// -----------------------------
// UI — 類別營收結構 (Service Structure)
// -----------------------------
let structureChart: any = null;

// 預定義穩定色盤 (Category -> Color)
const categoryColorMap: Record<string, string> = {
    "雷射": "#3b82f6",     // Blue
    "微整": "#8b5cf6",     // Purple
    "手術": "#ef4444",     // Red
    "音波": "#f59e0b",     // Amber
    "電波": "#10b981",     // Green
    "保養": "#06b6d4",     // Cyan
    "其他": "#9ca3af"      // Gray
};

function getCategoryColor(category: string, index: number): string {
    // 1. 已知類別回傳固定色
    for (const key in categoryColorMap) {
        if (category.includes(key)) return categoryColorMap[key];
    }
    
    // 2. 未知類別使用備用色盤
    const fallbackColors = [
        "#6366f1", "#ec4899", "#14b8a6", "#f97316", "#84cc16"
    ];
    return fallbackColors[index % fallbackColors.length];
}

/**
 * @param revenueMap { "雷射": 50000, "手術": 120000 }
 * @param titleSuffix "(2025-12)" or "(歷史累積)"
 */
function renderServiceStructureChart(revenueMap: any, titleSuffix: string) {
    const cvs = document.getElementById("srvStructureChart") as HTMLCanvasElement;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    
    // 1. 處理資料
    const catRevenue = revenueMap || {};
    let labels = Object.keys(catRevenue);
    
    // Clear chart if no data
    if (labels.length === 0) {
        if (structureChart) structureChart.destroy();
        return;
    }

    // Sort by Revenue DESC
    labels.sort((a, b) => catRevenue[b] - catRevenue[a]);
    
    const values = labels.map(l => catRevenue[l]);
    const totalRev = values.reduce((a, b) => a + b, 0);

    // ------------------------------------------------
    // Logic: 主力療程與風險提示
    // ------------------------------------------------
    const topCategory = labels[0];
    const topVal = values[0];
    const topPct = totalRev > 0 ? (topVal / totalRev) * 100 : 0;

    // A. 視覺標註 (>= 40% 視為主力)
    if (topPct >= 40) {
        // 修改第一名的 label，加上星號
        labels[0] = `${topCategory} ⭐ 主力`;
    }

    // B. 風險提示訊息
    let riskMsg = "";
    if (topPct >= 60) {
        riskMsg = "⚠️ 營收高度集中於單一療程，需留意市場或政策變動風險";
    } else if (topPct >= 40) {
        riskMsg = "ℹ️ 主力療程明確，可作為行銷與排程重點";
    } else {
        riskMsg = "✅ 營收結構分散，整體風險較低";
    }

    // C. 更新下方說明文字 (整合 Context + Risk)
    const noteEl = document.getElementById("service-structure-note");
    if (noteEl) {
        const isHistoryMode = titleSuffix.includes("歷史");
        const contextText = isHistoryMode 
            ? "顯示所有歷史完成療程的營收結構"
            : "本圖表顯示所選月份之已完成療程營收結構（不含取消與未到診）";
        
        noteEl.innerHTML = `
            <div style="margin-bottom:4px;">${contextText}</div>
            <div style="color: #666; font-weight: bold;">${riskMsg}</div>
        `;
    }
    
    // ------------------------------------------------

    const backgroundColors = labels.map((l, i) => {
        // Remove appended suffix for color lookup if needed
        const rawName = l.replace(" ⭐ 主力", "");
        return getCategoryColor(rawName, i);
    });

    // 2. 銷毀舊圖表
    if (structureChart) {
        structureChart.destroy();
    }

    // 3. 建立新圖表
    structureChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                title: {
                    display: true,
                    text: `療程營收結構 ${titleSuffix}`,
                    font: { size: 14, family: "'Noto Sans TC', sans-serif" },
                    padding: { bottom: 10 }
                },
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 12,
                        font: { family: "'Noto Sans TC', sans-serif", size: 14 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context: any) {
                            const val = context.parsed;
                            const pct = totalRev > 0 ? Math.round((val / totalRev) * 100) : 0;
                            return ` ${context.label}: ${formatCurrency(val)} (${pct}%)`;
                        }
                    },
                    bodyFont: { family: "'Noto Sans TC', sans-serif", size: 13 }
                }
            }
        }
    } as any);
}


// -----------------------------
// ⭐ 入口：頁面初始化
// -----------------------------
export function initServicesPage() {
  console.log("[Services] Init Page");

  const appts = dataStore.appointments;
  if (!appts || appts.length === 0) return;

  // 取得所有月份
  const months = [...new Set(
    appts.map(a => a.date.slice(0, 7)) // yyyy-mm
  )].sort();

  const select = document.getElementById("monthSelect") as HTMLSelectElement;
  select.innerHTML = months
    .map(m => `<option value="${m}">${m}</option>`)
    .join("");

  // 預設選 2025-12，若無則選最後一個
  const defaultMonth = "2025-12";
  if (months.includes(defaultMonth)) {
      select.value = defaultMonth;
  } else {
      select.value = months[months.length - 1];
  }

  // 綁定事件：切換月份
  select.addEventListener("change", e => {
    refreshServicesPage((e.target as HTMLSelectElement).value);
  });

  // 綁定事件：結構圖切換 (本月 vs 歷史)
  const btnMonth = document.getElementById("srv-struct-btn-month");
  const btnAll = document.getElementById("srv-struct-btn-all");
  const noteEl = document.getElementById("service-structure-note");

  if (btnMonth && btnAll) {
      btnMonth.addEventListener("click", () => {
          if (btnMonth.classList.contains("active")) return;
          // Switch to Month
          btnMonth.classList.add("active");
          btnAll.classList.remove("active");
          
          if (currentServicesData) {
              renderServiceStructureChart(
                  currentServicesData.categoryRevenue,
                  `(${currentServicesData.monthLabel})` // restore original label format
              );
          }
      });

      btnAll.addEventListener("click", () => {
        if (btnAll.classList.contains("active")) return;
        // Switch to All Time
        btnAll.classList.add("active");
        btnMonth.classList.remove("active");

        const allTimeRevenue = computeAllTimeServiceStructure();
        renderServiceStructureChart(allTimeRevenue, "(歷史累積)");
      });
  }

  // 初次載入
  refreshServicesPage(select.value);
}

declare global {
  interface Window {
    initServicesPage?: () => void;
  }
}
