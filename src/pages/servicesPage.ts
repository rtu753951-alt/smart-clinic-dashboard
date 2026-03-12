// =====================================================
//  Services Page — Month Switching (Final Fixed Version)
// =====================================================

import { updateServiceAISummary, generateServiceSuggestions } from "../logic/aiManager.js";
import { dataStore } from "../data/dataStore.js";
import { sandboxStore, SandboxState } from "../features/sandbox/sandboxStore.js";

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
  if (!dateStr) return false;
  // Use string slicing for robustness against timezone/Date object quirks
  // Expected format: YYYY-MM-DD
  const targetYM = `${year}-${String(month + 1).padStart(2, "0")}`;
  return dateStr.startsWith(targetYM);
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
  targetMonth: number,
  sandboxState?: SandboxState
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

  appointments.forEach((a, idx) => {
    if (!isInMonth(a.date, targetYear, targetMonth)) return;

    const d = new Date(a.date);
    const isFuture = d > cutoffDate;

    // 判斷是否計入營收
    let shouldIncludeRevenue = false;

    if (isFuture) {
        // 未來：completed + no_show + cancelled + paid
        // (含 cancelled/no_show 代表計算"原本預期會有的營收")
        if (["completed", "checked_in", "no_show", "cancelled", "paid"].includes(a.status)) {
            shouldIncludeRevenue = true;
            hasFutureContribution = true;
        }
    } else {
        // 過去 (含今天)：僅 completed + paid
        if (["completed", "checked_in", "paid"].includes(a.status)) {
            shouldIncludeRevenue = true;
        }
    }

    // 計算轉換率分母 (Potential)
    // 這裡維持原邏輯：Completed / Checked_in / Booked 都算 Potential
    const status = a.status;
    const isCompleted = status === "completed" || status === "checked_in";
    const isPotential = isCompleted || status === "booked";
    if (isPotential) potentialVisitCount++;
    if (isCompleted) successVisitCount++; 

    // 若不計入營收，就跳過金額計算
    if (!shouldIncludeRevenue) return;

    // Normalizing date key to YYYY-MM-DD for consistency
    // Handle both YYYY-MM-DD and YYYY/MM/DD
    const dateKey = a.date.slice(0, 10).replace(/\//g, "-");

    const items: string[] = (a.service_item || "")
         .split(";")
         .map((s: string) => s.trim())
         .filter(Boolean);


    let sum = 0;

    items.forEach((name: string) => {
      const info = serviceMap.get(name);
      let price = info ? Number(info.price) : 0;
      const category = info ? (info.category || "其他") : "其他";
      
      // Sandbox Growth Simulation
      if (sandboxState && sandboxState.isActive) {
          const growth = sandboxState.serviceGrowth[category as keyof typeof sandboxState.serviceGrowth] || 0;
          price = price * (1 + growth);
      }

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

      if (!dailyRevenue[dateKey]) dailyRevenue[dateKey] = 0;
      dailyRevenue[dateKey] += sum;
    }
  });
  
  console.log(`[Services] computeRevenue: Processed ${appointments.length} total. Found ${orderCount} valid revenue orders for ${targetYear}-${targetMonth+1}. Total Revenue: ${totalRevenue}`);
  if (appointments.length > 0 && orderCount === 0) {
      console.warn("[Services] computeRevenue: Matching Dec appointments but ZERO revenue. Check status values or serviceMap.");
  }

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
      
      // Sandbox Delta UI
      if (data.revenueDelta && Math.abs(data.revenueDeltaPct) >= 0.1) {
          const isUp = data.revenueDelta > 0;
          const color = isUp ? '#ef4444' : '#10b981'; // Red for Up (Revenue), Green for Down (Cost)? 
          // Usually Revenue Up is Good (Green) or Red (Hot)? 
          // In Financials: Green is Gain, Red is Loss.
          // In Workload: Red is Danger (High Load).
          // For Revenue, let's stick to standard financial colors: Green = Good/Up, Red = Bad/Down?
          // BUT Dashboard Theme uses Red for "High/Hot".
          // Let's use arrows: 🔺 (Red/Hot/Up), 🔻 (Green/Cool/Down).
          // User request: "用 icon 呈現影響結果上升或下降"
          // Let's match Workload style: 
          // 🔺 +5% (Red/Focus), 🔻 -5% (Green/Safe?) or just Red/Green based on value.
          // Revenue: Up = Good = Typically Green. Down = Bad = Red.
          // Workload: Up = Bad = Red. Down = Good = Green.
          // CONFLICT. 
          // Let's check general dashboard theme. "Accent" is Cyan/Blue.
          // Let's assume standard: Up = Red (Hot/Growth), Down = Green (Cool/Drop).
          // User prompt for Workload: 🔺 (Red) for Up.
          // Let's follow that pattern -> 🔺 = Up (Red), 🔻 = Down (Green).
          
          const icon = isUp ? '🔺' : '🔻';
          html += ` <span style="font-size:0.75rem; color:${color}; font-weight:bold; margin-left:8px;">${icon} ${data.revenueDeltaPct.toFixed(1)}%</span>`;
      } else if (data.revenueDelta !== undefined) {
          // No significant change
          html += ` <span style="font-size:0.75rem; color:#94a3b8; margin-left:8px;">⏺</span>`;
      }

      // 如果包含未來預估，加上 (預估) 小字
      if (data.hasFutureContribution) {
          html += ` <span style="font-size:0.75rem; color:#f39c12; font-weight:normal;">(預估)</span>`;
      }
      
      elRevenue.innerHTML = html;
  }

  // 2. 客單價
  const elAOV = document.getElementById("srv-aov");
  if (elAOV) {
      // Also apply delta to AOV? User asked for "Revenue Page". Usually "Revenue" is the main KPI.
      // Let's just do Revenue KPI for now to avoid clutter unless requested.
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
  if (!appts || appts.length === 0) {
      console.warn("[Services] No appointments in dataStore during refresh.");
      return;
  }
  const services = dataStore.services;

  // 1. 計算當月 (Simulated)
  const sbState = sandboxStore.getState();
  const currentResults = computeRevenue(appts, services, targetYear, targetMonth, sbState.isActive ? sbState : undefined);

  // 1b. 計算當月 (Original - for Delta)
  const originalResults = computeRevenue(appts, services, targetYear, targetMonth); // No Sandbox State

  // Delta Calculation
  const revenueDelta = currentResults.totalRevenue - originalResults.totalRevenue;
  const revenueDeltaPct = originalResults.totalRevenue > 0 ? (revenueDelta / originalResults.totalRevenue) * 100 : 0;

  // 2. 計算上個月 (MoM 用)
  // JS Date 自動處理月份回推 (Month 0 - 1 = Previous Year Month 11)
  const prevDate = new Date(targetYear, targetMonth - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();
  const prevResults = computeRevenue(appts, services, prevYear, prevMonth, sbState.isActive ? sbState : undefined); // MoM should usually compare Sim vs Sim or Orig vs Orig? 
  // Ideally MoM compares "Current Sim" vs "Previous (Historical/Sim)". 
  // Let's assume Previous is also Simulated if Sandbox is active to show "Trend if this continues", OR "Trend vs Reality".
  // Conservative approach: Apply Sandbox to previous if we want "Apple to Apple" simulation comparison.
  // BUT previous month data is usually HISTORICAL (fixed). Applying growth to history might be confusing?
  // User wants "Impact of Sandbox on Current Revenue".
  // So Previous can remain as is (Historical).
  // Check user intent: "Sandbox results... use icon to show up/down". This usually implies Current vs Original Delta.
  // MoM logic: (Current Sim - Previous Sim/Actual). Let's keep consistency.

  // 3. 計算 MoM
  let mom = 0;
  if (prevResults.totalRevenue > 0) {
      mom = ((currentResults.totalRevenue - prevResults.totalRevenue) / prevResults.totalRevenue) * 100;
  } else if (currentResults.totalRevenue > 0) {
      mom = 100; 
  }

  const finalData = {
      ...currentResults,
      mom: mom,
      dailyTopTreatments: getDailyTopTreatmentMap(appts),
      revenueDelta,
      revenueDeltaPct
  };

  currentServicesData = finalData;

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
  
  // Smart Pricing Strategy (No-Show & Package Logic)
  renderPricingStrategy();
}

function renderPricingStrategy() {
    console.log("💎 Checking Smart Pricing Strategy (Revenue Page)...");
    const serviceStats = new Map<string, { total: number; noShow: number }>();

    dataStore.appointments.forEach(a => {
        if (!a.service_item) return;
        const name = a.service_item;
        if (!serviceStats.has(name)) serviceStats.set(name, { total: 0, noShow: 0 });
        const stat = serviceStats.get(name)!;
        stat.total++;
        if (a.status === 'no_show') stat.noShow++;
    });

    const candidates: string[] = [];
    serviceStats.forEach((stat, name) => {
        if (stat.total < 10) return;
        const rate = stat.noShow / stat.total;
        if (rate > 0.05) candidates.push(name);
    });
    
    candidates.sort((a, b) => serviceStats.get(b)!.noShow - serviceStats.get(a)!.noShow);
    if (candidates.length === 0) return; 

    const targetService = candidates[0]; 
    const container = document.getElementById('srv-ai-suggestions');
    if (!container || document.getElementById('ai-smart-pricing')) return;

    const alertHTML = `
        <div id="ai-smart-pricing" style="margin-top: 16px; padding: 12px; background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; border-radius: 6px; display: flex; align-items: start; gap: 10px;">
            <div style="font-size: 1.1rem; color: #10b981;">💰</div>
            <div>
                 <strong style="color: #047857; font-size: 0.9rem; display: block; margin-bottom: 3px;">智慧營收保衛戰</strong>
                 <p style="color: #065f46; font-size: 0.85rem; line-height: 1.4; margin: 0;">
                    針對 ${targetService}，建議採取「預付訂金制」或「術後保養組合包」，在不降價的前提下降低 No-show 損失。
                 </p>
            </div>
        </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = alertHTML;
    container.appendChild(tempDiv);
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

    const year = data.targetYear;
    const month = data.targetMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const labels: string[] = [];
    const values: number[] = [];
    
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        labels.push(dateStr);
        const val = data.dailyRevenue[dateStr];
        values.push(typeof val === 'number' ? val : 0);
    }
    
    if (revenueChart) {
        revenueChart.destroy();
    }

    revenueChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "每日營收",
                data: values,
                borderColor: "#10b981", 
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                fill: true,
                borderWidth: 3,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: "#fff",
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 10, bottom: 0, left: 10, right: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    padding: 12,
                    callbacks: {
                        label: function(context: any) {
                             const val = context.parsed.y;
                             return `💰 營收: NT$${val.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        maxRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(226, 232, 240, 0.5)' },
                    ticks: {
                        color: '#64748b',
                        callback: (v: any) => {
                            if (v >= 10000) return (v / 10000).toFixed(0) + "萬";
                            return v;
                        }
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
                    display: false // Use custom legend
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

    // 4. Generate Custom Legend
    generateCustomLegend(structureChart, labels, backgroundColors, values);
}

// Helper: Custom Legend Logic (Leaderboard Style)
function generateCustomLegend(chart: any, labels: string[], colors: string[], values: number[]) {
    const container = document.getElementById('srv-legend-items');
    const countEl = document.getElementById('srv-legend-hidden-count');
    const btnAll = document.getElementById('srv-legend-btn-all');
    
    if (!container) return;

    const totalRevenue = values.reduce((a, b) => a + b, 0);

    const render = () => {
        container.innerHTML = '';
        let hiddenCount = 0;
        let visibleCount = 0;

        // Calculate counts first
        labels.forEach((_, i) => {
            if (chart.getDataVisibility(i) === false) hiddenCount++;
            else visibleCount++;
        });

        // Update Hidden Count Text
        if (countEl) countEl.innerText = `已隱藏 ${hiddenCount}`;

        // Render Items (Leaderboard)
        labels.forEach((label, i) => {
            const isHidden = chart.getDataVisibility(i) === false;
            const color = colors[i];
            const val = values[i];
            const pct = totalRevenue > 0 ? (val / totalRevenue) * 100 : 0;
            const pctStr = pct.toFixed(1) + '%';
            
            // Clean Label
            let cleanLabel = label.replace(' ⭐ 主力', '');
            let isMain = label.includes(' ⭐');

            // Item Wrapper
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex; flex-direction: column; gap: 4px;
                cursor: pointer; padding: 6px 8px; border-radius: 6px;
                transition: background 0.2s;
                opacity: ${isHidden ? '0.5' : '1'};
                border-bottom: 1px solid rgba(0,0,0,0.03);
            `;
            item.onmouseover = () => item.style.background = 'rgba(0,0,0,0.03)';
            item.onmouseout = () => item.style.background = 'transparent';
            if (isHidden) item.style.filter = 'grayscale(1)';

            // Top Row: Dot + Name ...... Amount + %
            const rowTop = document.createElement('div');
            rowTop.style.cssText = "display: flex; align-items: center; justify-content: space-between; width: 100%;";

            // Left: Dot + Name
            const left = document.createElement('div');
            left.style.cssText = "display: flex; align-items: center; gap: 6px; overflow: hidden;";
            
            const dot = document.createElement('div');
            dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: ${color}; flex-shrink: 0;`;
            
            const nameSpan = document.createElement('span');
            nameSpan.innerHTML = isMain ? `${cleanLabel} <span style="font-size:0.75em">⭐</span>` : cleanLabel;
            nameSpan.style.cssText = "font-size: 0.9rem; font-weight: 500; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
            
            left.appendChild(dot);
            left.appendChild(nameSpan);

            // Right: Amount + %
            const right = document.createElement('div');
            right.style.cssText = "display: flex; align-items: baseline; gap: 6px; flex-shrink: 0;";

            const amtSpan = document.createElement('span');
            amtSpan.innerText = formatCurrency(val);
            amtSpan.style.cssText = "font-size: 0.9rem; font-weight: 600; color: #334155;";

            const pctSpan = document.createElement('span');
            pctSpan.innerText = pctStr;
            pctSpan.style.cssText = "font-size: 0.75rem; color: #94a3b8; font-weight: 400;";

            right.appendChild(amtSpan);
            right.appendChild(pctSpan);

            rowTop.appendChild(left);
            rowTop.appendChild(right);

            // Bottom Row: Progress Bar
            const rowBar = document.createElement('div');
            rowBar.style.cssText = "width: 100%; height: 4px; background: rgba(0,0,0,0.05); border-radius: 2px; overflow: hidden;";
            
            const barFill = document.createElement('div');
            barFill.style.cssText = `width: ${pct}%; height: 100%; background: ${color}; border-radius: 2px; opacity: 0.8;`;
            
            rowBar.appendChild(barFill);

            // Click Handler
            item.onclick = () => {
                 if (!isHidden && visibleCount <= 1) {
                    alert("至少需保留一個顯示項目");
                    return;
                }
                chart.toggleDataVisibility(i);
                chart.update();
                render();
            };

            item.appendChild(rowTop);
            if (!isHidden) item.appendChild(rowBar); // Only show bar if visible

            container.appendChild(item);
        });
    };

    // Bind Select All
    if (btnAll) {
        const newBtn = btnAll.cloneNode(true);
        btnAll.parentNode?.replaceChild(newBtn, btnAll);
        newBtn.addEventListener('click', () => {
            labels.forEach((_, i) => {
                if (chart.getDataVisibility(i) === false) {
                     chart.toggleDataVisibility(i);
                }
            });
            chart.update();
            render();
        });
    }

    // Initial Render
    render();
}


// -----------------------------
// ⭐ 入口：頁面初始化
// -----------------------------
export async function initServicesPage() {
  console.log("[Services] Init Page");

  // 1. 檢查資料是否就緒 (Strict Readiness Check)
  if (!dataStore.isAppointmentsLoaded) {
      console.log("[Services] Appointments data not ready. Waiting...");
      const kpiContainer = document.querySelector(".kpi-grid");
      if (kpiContainer) {
          // Temporarily show loading in KPI area
          (kpiContainer as HTMLElement).style.opacity = "0.5";
      }
      
      const chartContainer = document.getElementById("srvRevenueChart")?.parentElement;
      if (chartContainer) {
          chartContainer.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:300px; color:#64748b;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>正在載入營收大數據...</p>
            </div>`;
      }

      await dataStore.prefetchCoreData();
      
      // Restore UI state
      if (kpiContainer) (kpiContainer as HTMLElement).style.opacity = "1";
      // Re-render chart container skeleton if we replaced it
      if (chartContainer) {
          chartContainer.innerHTML = `<canvas id="srvRevenueChart"></canvas>`;
      }
  }

  const appts = dataStore.appointments;
  if (!appts || appts.length === 0) {
      console.error("[Services] No data available after loading.");
      return;
  }

  // 取得所有月份
  const months = [...new Set(
    appts.map(a => a.date.slice(0, 7)) // yyyy-mm
  )].sort();

  const select = document.getElementById("monthSelect") as HTMLSelectElement;
  if (!select) return;

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
  select.onchange = (e) => {
    refreshServicesPage((e.target as HTMLSelectElement).value);
  };

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
