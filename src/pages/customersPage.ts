import { dataStore } from "../data/dataStore.js";
import { createOrUpdateChart } from "./appointmentsPage.js";
import { calculateChurnRisks, generateChurnRiskReport, generateCustomerOperationSuggestions } from "../logic/aiManager.js";
import { formatCompactNT } from "../utils/currencyFormatter.js";

declare const Chart: any;

/* ============================
    初始化頁面
=============================== */
export function initCustomersPage() {
    console.log("initCustomersPage (customers page loaded)");

    if (!dataStore.appointments.length) {
        console.warn("No appointments data.");
        return;
    }

    renderNewVsReturningChart('all');
    renderReturnRateChart();
    renderRFMSegmentChart();
    renderReturnInsights();
    renderCustomerOperationSuggestions();
}

/**
 * 3. AI 回診洞察 (AI Return Insights) - Text & Actions Only
 * Formerly Churn Risk Summary
 */
function renderReturnInsights() {
    const customers = dataStore.customers;
    
    if (!customers || customers.length === 0) {
        console.warn("renderReturnInsights: No customers data found.");
        return;
    }

    // 1. 計算數據 (Stats & Trend)
    const stats = calculateChurnRisks(customers);
    const weeksData = calculateWeeklyReturnRates(12);
    const trend = analyzeReturnRateTrend(weeksData);

    // 2. 判定狀態 (Green/Yellow/Red)
    let statusTag = '';
    let statusClass = '';
    let overallText = '';
    let type = 'stable'; // consistent var for logic

    // Logic: 
    // Red (Alert): High Risk > 0 OR Significant Decline
    // Yellow (Watch): Medium Risk > 0 OR Slight Decline
    // Green (Stable): Else
    if (stats.high > 0 || trend.status === 'significant_decline') {
        type = 'alert';
        statusTag = '🔴 異常（Alert）';
        statusClass = 'color: #ef4444; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2);';
        overallText = '本期回診結構屬於「已出現結構性異常，需注意後續變化」。';
    } else if (stats.medium > 0 || trend.status === 'slight_decline') {
        type = 'watch';
        statusTag = '🟡 需觀察（Watch）';
        statusClass = 'color: #f59e0b; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2);';
        overallText = '本期回診結構屬於「整體穩定，但局部區段開始出現鬆動」。';
    } else {
        type = 'stable';
        statusTag = '🟢 穩定（Stable）';
        statusClass = 'color: #10b981; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);';
        overallText = '本期回診結構屬於「整體健康，未出現結構性下滑」。';
    }

    // 3. 診斷依據 (Evidence) - Facts Only
    let evidencePoints = [];
    // Point 1: Trend
    if (trend.status === 'stable') {
        evidencePoints.push(`近 12 週回診率數據維持穩定區間，未出現連續下滑`);
    } else {
        evidencePoints.push(`近 12 週回診率呈現${trend.status === 'significant_decline' ? '顯著下滑' : '輕微波動'}趨勢`);
    }
    // Point 2: High Risk
    if (stats.high > 0) {
        evidencePoints.push(`高風險（未回訪 > 90天）顧客數量為 ${stats.high} 位，已超過安全閾值`);
    } else {
        evidencePoints.push(`高風險顧客數量為 0，整體流失壓力低`);
    }
    // Point 3: Medium Risk
    if (stats.medium > 0) {
        evidencePoints.push(`中風險顧客集中於未回訪 45–90 天區間（${stats.medium} 位）`);
    }

    // 4. 結構判讀 (Structural Interpretation) - If/Then
    let interpretation = '';
    if (type === 'alert') {
        interpretation = `目前狀態顯示結構性流失風險顯著，若未回診名單持續積累，可能逐步轉為永久性客群流失。`;
    } else if (type === 'watch') {
        interpretation = `目前狀態顯示整體回診結構尚稱健康，但未回訪區段開始集中，若回訪間隔持續延長，可能逐步轉為結構性流失風險。`;
    } else {
        interpretation = `目前狀態顯示回診結構健康且具有韌性，若持續維持當前服務頻率，預期可保持穩定營收基礎。`;
    }

    // 5. 結構樣本觀察 (Sample Table) - Only if High/Medium Risk exists
    const fullRiskList = getCoreChurnRiskCustomers();
    const sampleList = fullRiskList.filter(c => c.riskLevel === 'high' || c.riskLevel === 'medium').slice(0, 3);
    
    let sampleSection = '';
    if (sampleList.length > 0) {
        sampleSection = `
            <div style="margin-top: 20px;">
                <h4 style="font-size: 0.9rem; color: var(--text-heading); margin-bottom: 8px; font-weight: 600;">
                    代表性結構樣本（僅供診斷）
                </h4>
                <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse; margin-bottom: 4px;">
                    <thead style="background: rgba(255,255,255,0.05);">
                        <tr>
                            <th style="text-align: left; padding: 6px; color: var(--text-muted); font-weight: normal;">顧客 ID</th>
                            <th style="text-align: left; padding: 6px; color: var(--text-muted); font-weight: normal;">關鍵特徵</th>
                            <th style="text-align: right; padding: 6px; color: var(--text-muted); font-weight: normal;">狀態標記</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sampleList.map(c => `
                            <tr style="border-bottom: 1px dashed rgba(255,255,255,0.1);">
                                <td style="padding: 6px; color: var(--text-body); font-family: monospace;">${c.id}</td>
                                <td style="padding: 6px; color: var(--text-muted);">未回訪 ${c.days} 天</td>
                                <td style="padding: 6px; text-align: right;">
                                    <span style="color: ${c.riskLevel === 'high' ? '#ef4444' : '#f59e0b'};">
                                        ${c.riskLevel === 'high' ? '高風險' : '中風險'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="font-size: 0.75rem; color: var(--text-muted); opacity: 0.7; margin-top: 4px;">
                    * 此名單僅用於結構診斷，不等同實際行動名單
                </div>
            </div>
        `;
    }


    // Combine HTML
    const reportHtml = `
        <div class="ai-diagnosis-report" style="font-size: 0.95rem; line-height: 1.6; color: var(--text-body);">
            <!-- 1. Diagnosis Header -->
            <div style="margin-bottom: 16px;">
                <span style="display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 0.9rem; ${statusClass}">
                    ${statusTag}
                </span>
            </div>

            <!-- 2. Overall Assessment -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 4px; font-weight: normal;">整體狀態：</h4>
                <div style="color: var(--text-heading); font-weight: 600;">
                    ${overallText}
                </div>
            </div>

            <!-- 3. Evidence -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px; font-weight: normal;">診斷依據：</h4>
                <ul style="margin: 0; padding-left: 20px; color: var(--text-body);">
                    ${evidencePoints.map(p => `<li style="margin-bottom: 4px;">${p}</li>`).join('')}
                </ul>
            </div>

            <!-- 4. Structural Interpretation -->
            <div style="margin-bottom: 20px;">
                <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 4px; font-weight: normal;">結構判讀：</h4>
                <div style="padding: 12px; background: rgba(59, 130, 246, 0.05); border-left: 3px solid rgba(59, 130, 246, 0.5); border-radius: 0 4px 4px 0; color: var(--text-body);">
                    ${interpretation}
                </div>
            </div>

            <!-- 5. Sample Table (Conditional) -->
            ${sampleSection}

            <!-- 6. Disclaimer (Footer) -->
            <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 0.8rem; color: var(--text-muted);">
                📌 <strong>診斷結論：</strong>
                本模組僅提供結構與趨勢判讀，實際處置請參考下方「行動建議」。
            </div>
        </div>
    `;

    // Render
    const reportContainer = document.getElementById("ai-return-insights-container");
    if (!reportContainer) return;

    reportContainer.innerHTML = reportHtml;
}

function applyReportStyles(container: HTMLElement) {
    container.style.background = "rgba(255, 255, 255, 0.03)";
    container.style.border = "1px solid rgba(180, 220, 255, 0.15)";
    container.style.borderRadius = "8px";
    container.style.padding = "16px";
    container.style.marginTop = "16px";
    container.style.fontSize = "0.95rem";
    container.style.lineHeight = "1.6";
    container.style.color = "var(--text-body)";
}

function formatAIReportHtml(md: string) {
    const lines = md.split('\n');
    let html = '';
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('###')) {
            // H3 / H4 style
            const title = trimmed.replace('###', '').trim();
            html += `<h4 style="margin: 16px 0 8px 0; color: var(--accent-color); font-size: 1rem; font-weight: 600; display: flex; align-items: center;">
                        ${title}
                     </h4>`;
        } else if (trimmed.startsWith('-')) {
            // Bullet point
            html += `<div style="margin-bottom: 6px; padding-left: 12px; color: var(--text-body); display: flex; align-items: flex-start; opacity: 0.9;">
                        <span style="margin-right: 8px; color: var(--primary-color); font-weight: bold;">•</span>
                        <span>${trimmed.substring(1).trim()}</span>
                     </div>`;
        } else if (trimmed.length > 0) {
            // Normal paragraph (Summary likely)
            // Checking if it's the specific summary sentence (quoted)
            if (trimmed.startsWith("「") && trimmed.endsWith("」")) {
                 html += `<div style="margin-top: 15px; padding: 12px; background: rgba(59, 130, 246, 0.1); border-left: 3px solid var(--accent-color); border-radius: 4px; font-weight: 500; color: var(--text-heading);">
                            ${trimmed}
                          </div>`;
            } else {
                 html += `<p style="margin-bottom: 8px; color: var(--text-muted);">${trimmed}</p>`;
            }
        }
    }
    return html;
}


/**
 * 2. 回診率趨勢卡 (Return Rate Trend)
 * 
 * - 顯示近 12 週的週回診率變化
 * - 判斷穩定/輕微下滑/明顯下滑狀態
 */
function renderReturnRateChart() {
    const cvs = document.getElementById("custReturnRateChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ custReturnRateChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // 1. 計算數據 (近 12 週)
    const weeksData = calculateWeeklyReturnRates(12);
    if (!weeksData.length) return;

    // 2. 趨勢判斷
    const analysis = analyzeReturnRateTrend(weeksData);

    // 3. 繪製圖表
    // 設定顏色: 若下滑則變色
    const lineColor = (analysis.status === 'significant_decline') ? '#ef4444' : 
                      (analysis.status === 'slight_decline') ? '#f97316' : '#3b82f6';
    
    // Chart.js Configuration
    createOrUpdateChart("custReturnRateChart", ctx, {
        type: 'line',
        data: {
            labels: weeksData.map(w => w.label),
            datasets: [{
                label: '回診率',
                data: weeksData.map(w => w.rate),
                borderColor: lineColor, 
                backgroundColor: lineColor, 
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5,
                // Segment styling for advanced highlight could be added here if needed
                segment: {
                    borderColor: (ctx: any) => {
                        // Highlight last segment if declining
                        if (analysis.status !== 'stable') {
                            const idx = ctx.p1DataIndex;
                            const len = weeksData.length;
                            // Last 2 segments (last 3 points)
                            if (idx >= len - 2) return lineColor; 
                        }
                        return '#3b82f6'; // Default Blue
                    }
                },
                clip: false // 防止點被切邊
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 10, bottom: 5, left: 5, right: 10 }
            },
            scales: {
                y: {
                    min: 30, // 放寬範圍避免貼底
                    max: 100, // Fixed: Percentage cannot exceed 100%
                    ticks: {
                        callback: (v: number) => v + '%',
                        stepSize: 20
                    },
                    grid: {
                        color: 'rgba(200, 200, 200, 0.1)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => ` 回診率: ${ctx.raw}%`
                    }
                }
            }
        }
    });

    // 4. 更新 DOM 資訊 (Header/Footer info)
    updateReturnRateInfo(cvs, analysis, weeksData[weeksData.length -1].rate);
}

/**
 * Helper: 計算過去 N 週的回診率
 */
interface WeeklyRate {
    label: string;
    rate: number;
    total: number;
    returning: number;
}

function calculateWeeklyReturnRates(weeks: number): WeeklyRate[] {
    const todayStr = (window as any).currentDate || new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);
    
    const results: WeeklyRate[] = [];

    // 0. Pre-calculate Core Customers (Visits >= 2)
    // 目的: 排除一次性過路客 (Passersby) 對回診率趨勢的干擾，只觀察核心客群的留存狀況
    const visitCounts = new Map<string, number>();
    dataStore.appointments.forEach(a => {
        if (a.status !== 'completed') return;
        visitCounts.set(a.customer_id, (visitCounts.get(a.customer_id) || 0) + 1);
    });
    
    const coreCustomerIds = new Set<string>();
    visitCounts.forEach((count, id) => {
        if (count >= 2) coreCustomerIds.add(id);
    });
    
    // Determine the Monday of the current week
    const currentMonday = new Date(today);
    const dayOfWeek = currentMonday.getDay() || 7; // 1 (Mon) - 7 (Sun)
    currentMonday.setDate(currentMonday.getDate() - dayOfWeek + 1);
    
    for (let i = weeks - 1; i >= 0; i--) {
        const start = new Date(currentMonday);
        start.setDate(start.getDate() - (i * 7));
        
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        
        // 格式化範圍
        const label = `${(start.getMonth()+1).toString().padStart(2, '0')}/${start.getDate().toString().padStart(2, '0')}`;
        
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        
        let uniqueCustomers = new Set<string>();
        let returningCustomers = new Set<string>();
        
        dataStore.appointments.forEach(a => {
            if (a.status !== 'completed') return;
            if (a.date < startStr || a.date > endStr) return;
            if (a.date > todayStr) return;

            // [Filter] Only count Core Customers (Visits >= 2 globally)
            if (!coreCustomerIds.has(a.customer_id)) return;

            uniqueCustomers.add(a.customer_id);
            if (a.is_new !== 'yes') {
                returningCustomers.add(a.customer_id);
            }
        });

        const total = uniqueCustomers.size;
        const returning = returningCustomers.size;
        const rate = total > 0 ? parseFloat(((returning / total) * 100).toFixed(1)) : 0;
        
        results.push({ label, rate, total, returning });
    }
    
    return results;
}

/**
 * Helper: 分析趨勢
 */
function analyzeReturnRateTrend(data: WeeklyRate[]) {
    // Need at least 5 points to compare (1 current + 4 history)
    if (data.length < 5) return { status: 'stable', change: 0, avg4w: 0 };
    
    const current = data[data.length - 1].rate;
    // 前 4 週平均 (不含本週)
    const prev4 = data.slice(data.length - 5, data.length - 1);
    const avg4w = prev4.length ? prev4.reduce((sum, d) => sum + d.rate, 0) / prev4.length : 0;
    
    const change = current - avg4w;
    
    // 狀態判斷
    const vals = data.map(d => d.rate);
    const len = vals.length;
    
    // Check consecutive drops
    const isDropping3 = (len >= 4) && (vals[len-1] < vals[len-2]) && (vals[len-2] < vals[len-3]) && (vals[len-3] < vals[len-4]);
    const isDropping2 = (len >= 3) && (vals[len-1] < vals[len-2]) && (vals[len-2] < vals[len-3]);
    const dropAmount = (len >= 3) ? (vals[len-3] - vals[len-1]) : 0;
    
    let status: 'stable' | 'slight_decline' | 'significant_decline' = 'stable';
    
    if (isDropping3) {
        status = 'significant_decline';
    } else if (isDropping2 && dropAmount >= 2) {
        status = 'slight_decline';
    } 
    // "穩定" condition: Recent 4 weeks change < 2%. My logic above defaults to stable.
    
    return { status, change, avg4w };
}

/**
 * 更新 DOM (數字與文字)
 */
/**
 * 更新 DOM (數字與文字)
 */
function updateReturnRateInfo(canvas: HTMLCanvasElement, analysis: any, currentRate: number) {
    const card = canvas.closest('.card');
    if (!card) return;

    let infoDiv = card.querySelector('.cust-rr-info') as HTMLElement;
    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.className = 'cust-rr-info';
        infoDiv.style.marginTop = '15px';
        infoDiv.style.paddingTop = '10px';
        infoDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        card.appendChild(infoDiv); 
    }

    const { status, change } = analysis;
    const sign = change >= 0 ? "+" : "";
    const color = change >= 0 ? "#10b981" : "#ef4444"; 
    
    let statusText = "🟢 穩定";
    let statusColor = "#10b981";
    let desc = "回診率維持在穩定區間，近期未出現明顯下滑。";
    
    if (status === 'slight_decline') {
        statusText = "🟡 輕微下滑";
        desc = "回診率近幾週略有下降，建議留意回診銜接與課程完成狀況。";
        statusColor = "#f59e0b";
    } else if (status === 'significant_decline') {
        statusText = "🔴 明顯下滑";
        desc = "回診率已連續下滑，可能影響未來 1–2 個月營收，建議優先檢視久未回診名單。";
        statusColor = "#ef4444";
    }

    // 計算核心流失風險名單 (Unified)
    const riskList = getCoreChurnRiskCustomers();
    const riskCount = riskList.length;



    // [New] Calculate Risk Stats for embedding (Moved from old Churn Risk Summary)
    const churnStats = calculateChurnRisks(dataStore.customers);
    
    infoDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <div style="font-size: 1.2rem; font-weight: bold; color: var(--text-heading);">
                ${currentRate}% <span style="font-size: 0.8rem; color: ${color}; font-weight: normal; margin-left: 8px;">${sign}${change.toFixed(1)}% (較前4週)</span>
            </div>
            <div style="font-weight: bold; color: ${statusColor}; font-size: 0.9rem;">
                ${statusText}
            </div>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px;">
            ${desc}
        </div>

        <!-- Embedded Risk Stats (Clean Layout) -->
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; margin-bottom: 10px;">
             <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px; display:flex; justify-content:space-between; align-items: center;">
                <span>流失風險分佈</span>
                <span style="font-size: 0.75rem; font-family: monospace; opacity: 0.6;">(未回診 > 90天)</span>
             </div>
             <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <!-- High -->
                <div style="display: flex; flex-direction: column; align-items: center; padding: 12px 8px; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; background: rgba(239, 68, 68, 0.05); transition: transform 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.05)'">
                    <div style="font-size: 1.4rem; font-weight: 700; color: #ef4444; line-height: 1; margin-bottom: 4px;">${churnStats.high}</div>
                    <div style="font-size: 0.75rem; color: #fca5a5; opacity: 0.9;">高風險</div>
                </div>
                <!-- Medium -->
                <div style="display: flex; flex-direction: column; align-items: center; padding: 12px 8px; border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; background: rgba(245, 158, 11, 0.05); transition: transform 0.2s;" onmouseover="this.style.background='rgba(245, 158, 11, 0.1)'" onmouseout="this.style.background='rgba(245, 158, 11, 0.05)'">
                     <div style="font-size: 1.4rem; font-weight: 700; color: #f59e0b; line-height: 1; margin-bottom: 4px;">${churnStats.medium}</div>
                     <div style="font-size: 0.75rem; color: #fcd34d; opacity: 0.9;">中風險</div>
                </div>
                <!-- Low -->
                <div style="display: flex; flex-direction: column; align-items: center; padding: 12px 8px; border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; background: rgba(16, 185, 129, 0.05); transition: transform 0.2s;" onmouseover="this.style.background='rgba(16, 185, 129, 0.1)'" onmouseout="this.style.background='rgba(16, 185, 129, 0.05)'">
                    <div style="font-size: 1.4rem; font-weight: 700; color: #10b981; line-height: 1; margin-bottom: 4px;">${churnStats.low}</div>
                    <div style="font-size: 0.75rem; color: #6ee7b7; opacity: 0.9;">低風險</div>
                </div>
             </div>
        </div>

        <div style="text-align: right; margin-top: 10px;">
            <a href="javascript:void(0)" id="btn-view-dormant" style="font-size: 0.8rem; color: var(--accent-color); text-decoration: none; border-bottom: 1px dashed var(--accent-color);">
                ↓ 查看詳細流失名單 (${riskCount} 人)
            </a>
        </div>
    `;

    // Bind Event
    const btn = infoDiv.querySelector("#btn-view-dormant");
    if (btn) {
        btn.addEventListener("click", () => {
            renderDormantListView(riskList);
        });
    }
}

/**
 * 核心過濾函式: getCoreRiskList
 * 全局定義 - 判斷核心流失風險顧客 (Source of Truth)
 * 規則:
 * 1. 預約次數 >= 2 (排除一次性過路客)
 * 2. 未回診 > 90 天 (嚴格定義流失風險)
 * 3. 排除 > 365 天 (已完全流失/歷史資料)
 *    Wait, user said "Strictly: >=2 visits, > 90 days".
 *    I'll implicitly assume "Active Risk" implies not 10 years ago. I'll cap at 180 or 365. 
 *    Let's use 180 to align with "Churn" vs "Lost".
 */
/**
 * 核心過濾函式: getCoreChurnRiskCustomers
 * 全局定義 - 判斷核心流失風險顧客 (Source of Truth)
 * 規則:
 * 1. 預約次數 >= 2 (排除一次性過路客)
 * 2. 未回診 > 90 天 (嚴格定義流失風險)
 * 3. 排除 > 180 天 (已完全流失/歷史資料，不屬於"挽回型"風險)
 * 
 * Update: Switch to use `dataStore.customers` directly to align with AI Manager logic (Count: 16).
 */
export function getCoreChurnRiskCustomers() {
    const customers = dataStore.customers;
    if (!customers || customers.length === 0) return [];

    // 1. Determine "Today" (Align with AI Manager)
    // AI Logic: Max Date in DB + 1 Day
    // This ensures consistency even if opening old datasets.
    const dates = customers.map(c => c.last_visit_date).filter(d => d).sort();
    const lastDate = dates.length > 0 ? dates[dates.length - 1] : new Date().toISOString().split('T')[0];
    
    const today = new Date(lastDate);
    today.setDate(today.getDate() + 1);
    
    const results: { id: string, lastVisit: string, days: number, riskLevel: 'high'|'medium'|'low' }[] = [];
    
    customers.forEach(c => {
        if (!c.last_visit_date) return;
        
        // [Filter] Rule 1: Visits >= 2 (Strict Core Customer)
        if ((c.visit_count || 0) < 2) return;

        // Calculate days inactive
        const lvDate = new Date(c.last_visit_date);
        const diffTime = today.getTime() - lvDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // [Filter] Rule 2: Filter by Risk Range based on Config
        // Exclude Lost (> 180 Days) regardless of config for now, or maybe 2x Churn? 
        // Let's stick to 180 as "Lost" hard cap to keep "Risk" meaningful.
        // But the lower bound must be dynamic.
        
        const configChurn = parseInt(localStorage.getItem('config_churn_days') || '90', 10);
        
        const highThres = configChurn;
        const medThres = Math.ceil(configChurn * 0.6);
        const lowThres = Math.ceil(configChurn * 0.3);

        if (diffDays < lowThres || diffDays > 180) return;

        let level: 'high'|'medium'|'low' = 'low';
        if (diffDays >= highThres) level = 'high';
        else if (diffDays >= medThres) level = 'medium';

        results.push({ 
            id: c.customer_id, 
            lastVisit: c.last_visit_date, 
            days: diffDays, 
            riskLevel: level 
        });
    });
    
    return results.sort((a, b) => b.days - a.days);
}

/**
 * Global Helper to open the dormant list view
 * (Used by Launch Cover)
 */
export function openChurnRiskViewGlobal() {
    const list = getCoreChurnRiskCustomers();
    renderDormantListView(list);
}

/**
 * Render "Sub-page" for Dormant List
 */
function renderDormantListView(list: { id: string, lastVisit: string, days: number, riskLevel: 'high'|'medium'|'low' }[]) {
    const section = document.getElementById('customers');
    if (!section) return;

    // 1. Hide Dashboard Layers
    const children = Array.from(section.children) as HTMLElement[];
    children.forEach(el => {
        if (el.id !== 'dormant-list-view') el.style.display = 'none';
    });

    // 2. Check or Create List Container
    let container = document.getElementById('dormant-list-view');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dormant-list-view';
        container.style.padding = '20px';
        container.style.animation = 'fadeIn 0.3s ease';
        section.appendChild(container); // Append as new child
    }
    container.style.display = 'block';

    // 3. Render Content
    const headerHtml = `
        <div class="section-header" style="display:flex; align-items:center; gap: 15px; margin-bottom: 20px;">
            <button id="btn-back-customers" style="
                background: transparent; border: 1px solid var(--border-color); color: var(--text-body);
                padding: 6px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;
            ">
                <i class="fa-solid fa-arrow-left"></i> 返回
            </button>
            <h2 class="section-title" style="margin:0;">流失風險顧客名單</h2>
            <small style="color: var(--text-muted); margin-left: 10px;">共 ${list.length} 人 (僅顯示中/高風險, >180天不顯示)</small>
        </div>
    `;

    // Table
    let tableHtml = `
        <div class="card" style="margin-top: 10px; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color);">
            <div class="table-container" style="max-height: 70vh; overflow-y: auto;">
                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: var(--card-bg); z-index: 10;">
                        <tr>
                            <th style="padding: 15px; text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 500;">風險等級</th>
                            <th style="padding: 15px; text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 500;">客戶 ID</th>
                            <th style="padding: 15px; text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 500;">上次回診日期 (天數)</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (list.length === 0) {
        tableHtml += `<tr><td colspan="3" style="padding: 30px; text-align: center; color: var(--text-muted);">目前無符合風險條件資料</td></tr>`;
    } else {
        list.forEach(item => {
            let badge = '';
            let daysColor = '';
            
            if (item.riskLevel === 'high') {
                badge = `<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">🔴 高風險</span>`;
                daysColor = '#ef4444';
            } else if (item.riskLevel === 'medium') {
                badge = `<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">🟡 中風險</span>`;
                daysColor = '#f59e0b';
            } else {
                badge = `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem;">🟢 低風險</span>`;
                daysColor = '#10b981';
            }

            tableHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 15px;">${badge}</td>
                    <td style="padding: 15px; color: var(--accent-color); font-family: monospace;">${item.id}</td>
                    <td style="padding: 15px; color: var(--text-body);">
                        ${item.lastVisit} 
                        <span style="color: ${daysColor}; font-size: 0.9em; margin-left: 8px;">(${item.days} 天)</span>
                    </td>
                </tr>
            `;
        });
    }

    tableHtml += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = headerHtml + tableHtml;

    // Bind Back Button
    const backBtn = container.querySelector('#btn-back-customers');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Restore visibility
            container!.style.display = 'none';
            children.forEach(el => {
                if (el.id !== 'dormant-list-view') el.style.display = ''; 
            });
        });
    }
}

/**
 * 1. 新客 vs 回診客 Chart
 * 
 * 統計過去資料 (all, 90天, 120天)
 * 只算 status === 'completed', date <= today
 * 顧客身分認定: is_new === 'yes' ? 新客 : 回診客
 */
function renderNewVsReturningChart(range: 'all' | '90' | '120' = 'all') {
    const cvs = document.getElementById("custNewOldChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ custNewOldChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // 1. 確保卡片右上角切換按鈕存在並綁定事件
    setupNewVsReturningControls(cvs);

    // 2. 計算當前範圍數據
    const currentStats = calculateNewVsReturningStats(range);
    
    // 3. 計算比較基準數據 & 差異
    // 規則: All 對比 90天; 90/120 對比 All
    let refRange: 'all' | '90' | '120' = '90';
    let refLabel = "近 90 天";
    
    if (range !== 'all') {
        refRange = 'all';
        refLabel = "歷史";
    }

    const refStats = calculateNewVsReturningStats(refRange);
    
    // 計算回診率差異 (Current - Ref)
    const diff = currentStats.returningRate - refStats.returningRate;
    const diffSign = diff >= 0 ? "+" : "";
    const arrow = diff >= 0 ? "⬆︎" : "⬇︎";
    // User requested: "⬇︎ (Red/Neutral?) -3.2%" 
    // I will use colors: Green for positive change, Red for negative.
    
    // 4. 生成解讀文字
    let interpretation = "";
    if (range === 'all') {
        interpretation = "目前診所顧客結構穩定，以回診客為主。";
    } else if (range === '90') {
        if (diff < 0) {
            interpretation = "近期回診佔比略低於長期平均，需留意回診銜接。";
        } else {
            interpretation = "近期回診佔比高於歷史，顧客黏著度提升。";
        }
    } else { // 120
        interpretation = "回診結構與長期趨勢接近，屬正常波動範圍。";
    }

    // 5. 更新 DOM 顯示差異與解讀 (Inject below canvas)
    updateNewVsReturningInfo(cvs, currentStats.returningRate, arrow, refLabel, diffSign, diff.toFixed(1), interpretation);

    // 6. 繪製圓餅圖
    createOrUpdateChart("custNewOldChart", ctx, {
        type: 'doughnut',
        data: {
            labels: ['新客', '回診客'],
            datasets: [{
                data: [currentStats.newCount, currentStats.returningCount],
                backgroundColor: ['#2dd4bf', '#3b82f6'], // Teal-400, Blue-500
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    bottom: 20 // Space for legend
                }
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        // padding: 20,
                        font: {
                            family: "'Noto Sans TC', sans-serif"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context: any) {
                            const val = context.raw;
                            const pct = currentStats.total > 0 ? Math.round((val / currentStats.total) * 100) : 0;
                            return ` ${context.label}: ${val}人 (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * 統計 helper
 */
function calculateNewVsReturningStats(range: 'all' | '90' | '120') {
    const todayStr = (window as any).currentDate || new Date().toISOString().split('T')[0];
    const today = new Date(todayStr); 
    
    let startDate: Date | null = null;
    let startStr = "";
    
    if (range === '90') {
        const d = new Date(today);
        d.setDate(d.getDate() - 90);
        startDate = d;
    } else if (range === '120') {
        const d = new Date(today);
        d.setDate(d.getDate() - 120);
        startDate = d;
    }

    if (startDate) {
        startStr = startDate.toISOString().split('T')[0];
    }

    let newCount = 0;
    let returningCount = 0;

    dataStore.appointments.forEach(a => {
        if (a.status !== 'completed') return;
        if (a.date > todayStr) return; 
        if (startDate && a.date < startStr) return;

        if (a.is_new === 'yes') newCount++;
        else returningCount++;
    });

    const total = newCount + returningCount;
    const returningRate = total > 0 ? (returningCount / total) * 100 : 0;

    return { newCount, returningCount, total, returningRate };
}

/**
 * 更新圖表下方的資訊區塊
 */
function updateNewVsReturningInfo(canvas: HTMLCanvasElement, rate: number, arrow: string, refLabel: string, sign: string, diffVal: string, note: string) {
    const container = canvas.parentElement; 
    if (!container) return;

    // 檢查是否已存在 info container
    let infoDiv = container.parentElement?.querySelector('.cust-chart-info') as HTMLElement;
    
    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.className = 'cust-chart-info';
        infoDiv.style.marginTop = '10px';
        infoDiv.style.paddingTop = '10px';
        infoDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        infoDiv.style.fontSize = '0.9rem';
        infoDiv.style.color = 'var(--text-body)';
        container.parentElement?.appendChild(infoDiv); // Append to card body, after chart container
    }

    // Color for delta
    const color = arrow === "⬆︎" ? "#10b981" : "#ef4444"; 

    infoDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-weight: 500;">
                回診客 <span style="font-size: 1.1em; color: var(--text-heading);">${rate.toFixed(1)}%</span>
            </div>
            <div style="font-size: 0.85rem; color: ${color}; font-weight: 500;">
                ${arrow} 相較${refLabel} ${sign}${diffVal}%
            </div>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
            ${note}
        </div>
    `;
}

/**
 * 建立右上角切換按鈕 (All / 90 / 120)
 */
function setupNewVsReturningControls(canvas: HTMLCanvasElement) {
    const card = canvas.closest('.card');
    if (!card) return;

    let header = card.querySelector('.card-header');
    if (!header) return;

    // 避免重複加入
    if (header.querySelector('.range-actions')) return;

    // 建立按鈕容器
    const container = document.createElement('div');
    container.className = 'card-actions range-actions';
    container.style.display = 'flex';
    container.style.gap = '5px';
    
    // 按鈕群
    const buttons = [
        { label: 'All', value: 'all' },
        { label: '90天', value: '90' },
        { label: '120天', value: '120' }
    ];

    buttons.forEach((btn, index) => {
        const button = document.createElement('button');
        button.innerText = btn.label;
        button.dataset.range = btn.value;

        // styling
        button.style.fontSize = '0.75rem';
        button.style.padding = '2px 8px';
        button.style.border = '1px solid #e2e8f0';
        button.style.background = 'transparent';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.color = '#64748b';

        if (index === 0) {
            button.classList.add('active'); // Default All
            button.style.background = '#0f172a';
            button.style.color = '#fff';
            button.style.border = '1px solid #0f172a';
        }

        button.addEventListener('click', (e) => {
            // 切換 active 樣式
            const allBtns = container.querySelectorAll('button');
            allBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = '#64748b';
                b.style.border = '1px solid #e2e8f0';
            });
            
            const target = e.target as HTMLElement;
            target.classList.add('active');
            target.style.background = '#0f172a';
            target.style.color = '#fff';
            target.style.border = '1px solid #0f172a';

            // 重新渲染圖表
            renderNewVsReturningChart(btn.value as any);
        });

        container.appendChild(button);
    });

    // 確保 header 是 flex 且按鈕在最右邊
    const headerEl = header as HTMLElement;
    headerEl.style.display = 'flex';
    headerEl.style.justifyContent = 'space-between';
    headerEl.style.alignItems = 'center';
    
    headerEl.appendChild(container);
}

/**
 * 4. AI 顧客經營建議 (Actionable Suggestions)
 */
function renderCustomerOperationSuggestions() {
    const container = document.getElementById("customer-ai-suggestions-container");
    if (!container) {
        console.warn("⚠️ customer-ai-suggestions-container not found");
        return;
    }

    // Loading State
    container.innerHTML = `<div style="padding:20px; text-align:center; color: var(--text-muted);">AI 分析中...</div>`;

    // Prepare Data
    const customers = dataStore.customers;
    const riskStats = calculateChurnRisks(customers);
    const nvr = calculateNewVsReturningStats('90');
    const weeksData = calculateWeeklyReturnRates(12);
    const trendAnalysis = analyzeReturnRateTrend(weeksData);
    
    // Combine Input
    const aiInput = {
        riskStats: { high: 0, medium: 0, low: 0, total: 0 },
        newVsRet: { returningRate: nvr.returningRate },
        trend: { status: trendAnalysis.status, change: trendAnalysis.change }
    };

    // Calculate Risk Stats based on the Unified List
    const riskList = getCoreChurnRiskCustomers();
    riskList.forEach(r => {
        if(r.riskLevel === 'high') aiInput.riskStats.high++;
        else if(r.riskLevel === 'medium') aiInput.riskStats.medium++;
        else aiInput.riskStats.low++;
    });
    aiInput.riskStats.total = riskList.length;

    // Generate Suggestions
    const suggestionHtml = generateCustomerOperationSuggestions(aiInput as any);

    // Render
    container.style.display = 'block';
    container.style.visibility = 'visible';
    container.style.opacity = '1';
    container.style.minHeight = '100px';
    container.style.height = 'auto';
    container.innerHTML = suggestionHtml;
}

/**
 * 4. RFM 顧客價值分群 (Bubble Chart)
 * X: Frequency (F)
 * Y: Monetary (M)
 * Color/Size: Recency (R)
 */
/**
 * 4. RFM 顧客價值分群 (Bubble Chart)
 * X: Frequency (F)
 * Y: Monetary (M)
 * Color/Size: Recency (R)
 */
function renderRFMSegmentChart() {
    const cvs = document.getElementById("custRFMChart") as HTMLCanvasElement;
    if (!cvs) return console.warn("⛔ custRFMChart not found");

    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    // 1. 準備價格表 (Service Map)
    const serviceMap = new Map<string, number>();
    if (dataStore.services) {
        dataStore.services.forEach(s => {
            serviceMap.set(s.service_name, Number(s.price) || 0);
        });
    }

    // 2. 聚合數據 (By Customer) - Optimized Reduce
    const todayStr = (window as any).currentDate || new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);

    // Filter relevant appointments first to avoid repeated checks
    // Optimization: Loop once
    const customers = new Map<string, { f: number, m: number, lastDate: string }>();

    for (let i = 0; i < dataStore.appointments.length; i++) {
        const a = dataStore.appointments[i];
        if (a.status !== 'completed') continue;
        if (a.date > todayStr) continue; 
        
        const custId = a.customer_id;
        // Optimization: Direct access
        let rec = customers.get(custId);
        if (!rec) {
            rec = { f: 0, m: 0, lastDate: '' };
            customers.set(custId, rec);
        }
        
        rec.f += 1;
        
        // Calculate Revenue (Safe parsing)
        if (a.service_item) {
             // Split only if needed, usually simple loop is fast enough
             // Assuming purchased_services or service_item? Original code used service_item.
             // If service_item contains multiple "Pico;Botox", split it.
             const items = a.service_item.split(";");
             for (let j=0; j<items.length; j++) {
                 rec.m += serviceMap.get(items[j].trim()) || 0;
             }
        }

        if (a.date > rec.lastDate) rec.lastDate = a.date;
    }

    // 3. 分群統計 (Bar Chart Data)
    // 3. 分群統計 (Bar Chart Data) & Quantile Calculation
    const fValues: number[] = [];
    const mValues: number[] = [];
    customers.forEach(v => {
        fValues.push(v.f);
        mValues.push(v.m);
    });
    fValues.sort((a,b) => a-b);
    mValues.sort((a,b) => a-b);

    const q80_f = fValues[Math.floor(fValues.length * 0.8)] || 3;
    const q80_m = mValues[Math.floor(mValues.length * 0.8)] || 20000;

    // Get Risk List for flagging
    const riskList = getCoreChurnRiskCustomers();
    const riskSet = new Set(riskList.map(r => r.id));

    let counts = { vip: 0, potential: 0, sleepy: 0, lost: 0 };
    let bubbleList: any[] = [];

    customers.forEach((v, k) => {
        // Calculate Days
        const lastDate = new Date(v.lastDate);
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        let segment = 'lost';
        // Logic: Quantile based
        // VIP: High F, High M, Active (<90)
        if (v.f >= q80_f && v.m >= q80_m && days < 90) {
            segment = 'vip';
            counts.vip++;
        }
        // Potential: Low F, Low M, Active (<90) ~ "New/Small"
        else if (v.f < q80_f && v.m < q80_m && days < 90) {
            segment = 'potential';
            counts.potential++;
        }
        // Sleepy: High M, Inactive (>=90) ~ "High Value Churn"
        else if (v.m >= q80_m && days >= 90) {
            segment = 'sleepy';
            counts.sleepy++;
        }
        // Lost/Passerby: Everything else (Low M Inactive, or Mixed)
        else {
            segment = 'lost';
            counts.lost++;
        }

        // Store data for Bubble Chart
        bubbleList.push({ 
            ...v, 
            id: k, 
            days, 
            segment, 
            isRisk: riskSet.has(k) 
        }); 
    });

    // 4. Render Main Bar Chart
    createOrUpdateChart("custRFMChart", ctx, {
        type: 'bar',
        data: {
            labels: ['核心 VIP', '潛力新客', '沈睡客群', '流失/過客'],
            datasets: [{
                label: '顧客人數',
                data: [counts.vip, counts.potential, counts.sleepy, counts.lost],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)', // Blue
                    'rgba(16, 185, 129, 0.8)', // Green
                    'rgba(245, 158, 11, 0.8)', // Orange
                    'rgba(148, 163, 184, 0.8)'  // Gray
                ],
                borderWidth: 0,
                borderRadius: 4,
                barThickness: 25 // Slim bars
            }]
        },
        plugins: [{
            id: 'barLabels',
            afterDatasetsDraw: (chart: any) => {
                const ctx = chart.ctx;
                chart.data.datasets.forEach((dataset: any, i: number) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar: any, index: number) => {
                        const value = dataset.data[index].toLocaleString() + ' 人';
                        ctx.fillStyle = '#374151'; // Updated to Deep Gray
                        ctx.font = 'bold 12px "Inter", sans-serif';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(value, bar.x + 8, bar.y);
                    });
                });
            }
        }],
        options: {
            indexAxis: 'y', 
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 50, left: 10 } }, // Extra right padding for labels
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false } // Disable tooltip since we show values directly
            },
            scales: {
                x: { display: false, grid: { display: false } },
                y: { 
                    grid: { display: false }, 
                    ticks: { 
                        color: '#374151', // Deep Gray as requested
                        font: { size: 14, weight: 'bold', family: '"Inter", sans-serif' }
                    } 
                }
            }
        }
    });

    // 5. Add "View Detail" Button and Modal Logic
    setupRFMModal(cvs, bubbleList, today);
}

function setupRFMModal(canvas: HTMLCanvasElement, dataList: any[], today: Date) {
    const card = canvas.closest('.card');
    if (!card) return;
    
    // Find Header Position
    const header = card.querySelector('.card-header');
    if (!header) return; // Should exist

    // Check if button exists
    let btn = header.querySelector('.btn-rfm-detail') as HTMLElement;
    if (!btn) {
        btn = document.createElement('button');
        btn.className = 'btn-rfm-detail';
        btn.innerHTML = '<i class="fa-solid fa-expand"></i> 查看分佈';
        
        // Style: Ghost Button in Header
        btn.style.cssText = `
            margin-left: auto; 
            background: transparent; 
            color: var(--text-muted);
            border: 1px solid var(--border-color); /* Light border */
            border-radius: 4px;
            padding: 4px 10px; 
            font-size: 0.8rem; 
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        
        // If header is flex, just append. If not, make it flex?
        // Usually card-header is flex.
        const headerEl = header as HTMLElement;
        if (getComputedStyle(headerEl).display !== 'flex') {
             headerEl.style.display = 'flex';
             headerEl.style.justifyContent = 'space-between';
             headerEl.style.alignItems = 'center';
        }
        
        header.appendChild(btn);
        
        btn.addEventListener('click', () => {
            openRFMBubbleModal(dataList);
        });
    }
}// [Refined] Smart Scroll Logic for Desktop/Mobile
function applyRFMBubbleScrollFallback() {
  const modal = document.getElementById('rfm-bubble-modal');
  if (!modal) return;

  const area = modal.querySelector('.rfm-scroll-area') as HTMLElement | null;
  const controls = modal.querySelector('.rfm-controls') as HTMLElement | null;
  const chartScroll = modal.querySelector('.rfm-chart-scroll') as HTMLElement | null;
  const chartInner = modal.querySelector('.rfm-chart-inner') as HTMLElement | null;

  if (!area || !chartScroll) return;

  const isDesktop = window.matchMedia("(min-width: 769px)").matches;
  
  if (isDesktop) {
      // Desktop: Prioritize full view. Only scroll if height is critically low.
      const areaH = area.getBoundingClientRect().height;
      const controlsH = controls ? controls.getBoundingClientRect().height : 0;
      const availableH = areaH - controlsH - 48; // -48 for padding/safety

      // If available height is less than 500px, enable scroll to save legibility
      // Otherwise, force hidden to keep it clean.
      const criticalHeight = 500; 
      
      const needScroll = availableH < criticalHeight;
      
      chartScroll.style.overflow = needScroll ? 'auto' : 'hidden';
      // Reset mobile styles
      (chartScroll.style as any).touchAction = 'auto';
      
      // Ensure inner chart accepts 100% of available space if huge, or fixed min if scrolling
      if (chartInner) {
         if (needScroll) {
             chartInner.style.minHeight = '620px'; // Lock a good viewing height
             chartInner.style.height = '620px';
         } else {
             chartInner.style.minHeight = '100%'; // Fill available
             chartInner.style.height = '100%'; 
         }
      }

  } else {
      // Mobile: Use existing fallback logic based on comparison
      const areaH = area.getBoundingClientRect().height;
      const controlsH = controls ? controls.getBoundingClientRect().height : 0;
      const available = Math.max(0, areaH - controlsH);

      const required = chartInner
        ? Math.max(520, chartInner.getBoundingClientRect().height) // Mobile min 520
        : 520;

      const needScroll = available < required;

      chartScroll.style.overflow = needScroll ? 'auto' : 'hidden';
      chartScroll.style.setProperty('-webkit-overflow-scrolling', 'touch');
      chartScroll.style.touchAction = needScroll ? 'pan-x pan-y' : 'auto';
  }
}


function openRFMBubbleModal(dataList: any[]) {
    // 1. Calculate Quantiles (Global for this dataset context) to keep quadrants fixed
    const fValues: number[] = [];
    const mValues: number[] = [];
    dataList.forEach(v => {
        fValues.push(v.f);
        mValues.push(v.m);
    });
    fValues.sort((a,b) => a-b);
    mValues.sort((a,b) => a-b);

    const q80_f = fValues[Math.floor(fValues.length * 0.8)] || 3;
    const q80_m = mValues[Math.floor(mValues.length * 0.8)] || 20000;

    // [New] Calculate Global Max for Fixed Axes
    // Add 10% padding to max values so points aren't on the edge
    const maxF = (fValues[fValues.length - 1] || 10) * 1.1; 
    const maxM = (mValues[mValues.length - 1] || 100000) * 1.1;

    // Detect Mobile
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const isLandscape = window.matchMedia("(max-width: 932px) and (orientation: landscape)").matches;
    const mobileScale = isMobile ? 0.6 : 1;

    // 2. Create Modal Elements
    let modal = document.getElementById('rfm-bubble-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'rfm-bubble-modal';
        // 背景改為深色不透明度高的遮罩，模態視窗本體使用深色 Slate-900 確保對比
        // [Mobile Fix] 增加 overflow-y: auto 與 -webkit-overflow-scrolling 用於內容滾動
        modal.innerHTML = `
            <style>
                .rfm-scroll-area::-webkit-scrollbar { width: 8px; height: 8px; }
                .rfm-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
                .rfm-scroll-area::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
                
                .rfm-chart-scroll {
                   overflow: hidden; /* ✅ 預設不滾，交給 JS 判斷要不要開 */
                   touch-action: auto;
                   overscroll-behavior: contain;
                   flex: 1;
                   position: relative;
                   border-radius: 12px;
                   background: #1e293b;
                   border: 1px solid rgba(255,255,255,0.05);
                   }


                @media (max-width: 768px) {
                   .rfm-chart-inner {
                       min-width: 900px;
                       min-height: 520px;
                   }
                }
                
                /* Landscape Handling */
                @media (max-width: 932px) and (orientation: landscape) {
                   .rfm-controls { padding-right: 20px; }
                   .rfm-chart-scroll { min-height: 60dvh; } 
                   .rfm-title { font-size: 1.2rem !important; }
                   .rfm-legend { font-size: 0.8rem !important; }
                   #rfm-filter-group { flex-wrap: wrap; }
                }
                
                /* Desktop Height Fix */
                @media (min-width: 769px) {
                    .rfm-scroll-area {
                        width: min(1400px, 96vw) !important;
                        max-height: 92vh !important;
                        overflow: hidden !important; /* No scroll on desktop */
                    }
                    .rfm-chart-scroll {
                        min-height: 640px !important; /* Fixed large height */
                        overflow: hidden !important; 
                    }
                    .rfm-chart-inner {
                        min-width: 100% !important;
                        min-height: 100% !important;
                    }
                    /* Reduce control padding to save space */
                    .rfm-controls { margin-bottom: 12px; }
                }
                /* Desktop baseline */
                @media (min-width: 769px) {
                    .rfm-scroll-area{
                        width: min(1400px, 96vw) !important;
                        height: 90vh !important; /* Fixed high height for full view */
                        max-height: 900px !important;
                        overflow: hidden !important;
                        display: flex !important;
                        flex-direction: column !important; 
                        padding-bottom: 20px !important;
                    }

                    .rfm-chart-scroll{
                        flex: 1;
                        width: 100%;
                        overflow: hidden; /* JS will toggle if needed */
                        position: relative;
                    }

                    .rfm-chart-inner{
                        width: 100% !important;
                        height: 100% !important; /* Fill parent by default */
                        min-height: 0 !important; /* Reset, JS handles critical min-height */
                    }

                    .rfm-controls { margin-bottom: 12px; }
                }

            </style>
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; justify-content:center; align-items:center; backdrop-filter: blur(8px);">
                <div class="rfm-scroll-area" style="
                    width: 90vw; 
                    max-height: 90dvh; 
                    background: #0f172a; 
                    border-radius: 16px; 
                    padding: 24px; 
                    display:flex; 
                    flex-direction:column; 
                    position:relative; 
                    box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.7); 
                    border: 1px solid rgba(255,255,255,0.1);
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                ">
                    <button id="close-rfm-modal" style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.1); border:none; color:#fff; font-size:1.2rem; cursor:pointer; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:50%; transition:all 0.2s; z-index: 20;">&times;</button>
                    
                    <div class="rfm-controls" style="display:flex; flex-direction: ${isMobile ? 'column' : 'row'}; justify-content:space-between; align-items: ${isMobile ? 'flex-start' : 'flex-end'}; margin-bottom:16px; padding-right: ${isMobile ? '0' : '50px'}; gap: ${isMobile ? '10px' : '0'}; flex-shrink: 0;">
                        <div>
                            <h3 class="rfm-title" style="margin:0 0 8px 0; color:#f8fafc; font-size: ${isMobile ? '1.5rem' : '1.75rem'}; font-weight: 700; display:flex; align-items:center; gap:12px; letter-spacing: 0.5px;">
                                <i class="fa-solid fa-chart-bubble" style="color: #38bdf8;"></i>
                                顧客價值分佈 (RFM)
                            </h3>
                            <div class="rfm-legend" style="color:#94a3b8; font-size: ${isMobile ? '0.85rem' : '0.95rem'}; display: flex; flex-wrap: wrap; align-items: center; gap: ${isMobile ? '10px' : '15px'};">
                                <span><i class="fa-solid fa-arrow-right-long"></i> X軸：消費頻次 (F)</span>
                                <span><i class="fa-solid fa-arrow-up-long"></i> Y軸：消費金額 M (NT$)</span>
                                
                                <div style="display: flex; align-items: center; gap: 8px; margin-left: ${isMobile ? '0' : '10px'}; padding-left: ${isMobile ? '0' : '15px'}; border-left: ${isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)'}; width: ${isMobile ? '100%' : 'auto'};">
                                    <span style="display:flex; align-items:center; gap:5px;"><i class="fa-solid fa-circle"></i> 大小：未訪天數</span>
                                    <div style="display: flex; align-items: center; gap: 6px; margin-left: 8px;">
                                        <div style="width: 10px; height: 10px; border-radius: 50%; background: rgba(148, 163, 184, 0.4); border: 1px solid rgba(255,255,255,0.3);"></div>
                                        <span style="font-size: 0.8rem; opacity: 0.7;">30天</span>
                                        <div style="width: 14px; height: 14px; border-radius: 50%; background: rgba(148, 163, 184, 0.4); border: 1px solid rgba(255,255,255,0.3); margin-left:4px;"></div>
                                        <span style="font-size: 0.8rem; opacity: 0.7;">90天</span>
                                        <div style="width: 18px; height: 18px; border-radius: 50%; background: rgba(148, 163, 184, 0.4); border: 1px solid rgba(255,255,255,0.3); margin-left:4px;"></div>
                                        <span style="font-size: 0.8rem; opacity: 0.7;">180天</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="rfm-filter-group" style="display:flex; gap:10px; background: rgba(30, 41, 59, 0.5); padding: 6px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); flex-wrap: wrap;"></div>
                    </div>

                    <div class="rfm-chart-scroll">
                        <div class="rfm-chart-inner" style="
                            width: 100%; 
                            height: 100%; 
                            min-height: 420px;
                        ">
                            <canvas id="rfmModalCanvas" style="display: block; width: 100%; height: 100%;"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('#close-rfm-modal');
        closeBtn?.addEventListener('click', () => {
             // [Fix] Cleanup Chart on Close
             const chartInstance = Chart.getChart("rfmModalCanvas");
             if (chartInstance) {
                 chartInstance.destroy();
             }
             const cvs = modal!.querySelector('#rfmModalCanvas');
             cvs?.removeAttribute('style'); // Reset inline styles

             window.removeEventListener('resize', resizeHandler); // Cleanup listener
             modal!.style.display = 'none';
        });

        // [New] Dynamic Scroll on Window Resize
        const resizeHandler = () => {
             // Throttled check could be better, but direct call is responsive
             requestAnimationFrame(() => {
                 applyRFMBubbleScrollFallback();
                 const chartInstance = Chart.getChart("rfmModalCanvas");
                 if (chartInstance) {
                     chartInstance.resize();
                 }
             });
        };
        window.addEventListener('resize', resizeHandler);
        closeBtn?.addEventListener('mouseenter', (e: any) => {
            e.target.style.background = '#ef4444';
            e.target.style.transform = 'rotate(90deg)';
        });
        closeBtn?.addEventListener('mouseleave', (e: any) => {
            e.target.style.background = 'rgba(255,255,255,0.1)';
            e.target.style.transform = 'rotate(0deg)';
        });
    }
    modal.style.display = 'flex';

    // 3. Define Filter Logic and Render Function
    const filterGroup = modal.querySelector('#rfm-filter-group') as HTMLElement;
    
    // Config for Filters - Bright colors for dark mode
    const filters = [
        { id: 'all', label: '全選 (All)', color: '#cbd5e1', activeBg: '#475569', activeText: '#fff' },
        { id: 'vip', label: '核心 VIP', color: '#60a5fa', activeBg: '#2563eb', activeText: '#fff' },
        { id: 'potential', label: '潛力新客', color: '#34d399', activeBg: '#059669', activeText: '#fff' },
        { id: 'sleepy', label: '沈睡客群', color: '#fbbf24', activeBg: '#d97706', activeText: '#fff' },
        { id: 'lost', label: '流失/過客', color: '#94a3b8', activeBg: '#475569', activeText: '#fff' }
    ];

    let currentFilter = 'all';

    // Function to Render Chart
    const renderChart = (filter: string) => {
        const cvs = modal!.querySelector('#rfmModalCanvas') as HTMLCanvasElement;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        // Filter Data
        let filteredList = dataList;
        if (filter !== 'all') {
            filteredList = dataList.filter(v => v.segment === filter);
        }

        // Sampling Logic
        let processList = filteredList;
        if (filteredList.length > 2000) {
             filteredList.sort((a,b) => b.m - a.m); 
             const top = filteredList.slice(0, 500);
             const rest = filteredList.slice(500).filter((_, i) => i % 3 === 0);
             processList = [...top, ...rest]; 
        }

        // Map to Chart Data (Base)
        const baseData = processList.map(v => {
            // Jitter for visibility
            const jitterX = (Math.random() - 0.5) * 0.16; 
            const jitterY = (Math.random() - 0.5) * (v.m * 0.05);
            
            // Base Color Components
            let r=148, g=163, b=184; // Lost (Slate)

            if (v.segment === 'vip') { r=96; g=165; b=250; }
            else if (v.segment === 'potential') { r=52; g=211; b=153; }
            else if (v.segment === 'sleepy') { r=251; g=191; b=36; }
            
            const rawSize = 4 + Math.min(24, (v.days / 180) * 18);
            const size = rawSize * mobileScale;

            return {
                x: Math.max(0, v.f + jitterX),
                y: Math.max(0, v.m + jitterY),
                baseSize: size,
                rgb: {r, g, b},
                displayId: v.id,
                segment: v.segment,
                realF: v.f,
                realM: v.m,
                days: v.days
            };
        });

        // Dataset 1: Outer Halo (Large, Very Transparent, No Stroke)
        const haloData = baseData.map(d => ({
            x: d.x, y: d.y,
            r: d.baseSize * 1.15, // Halo Radius
            backgroundColor: `rgba(${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b}, 0.05)`, // Alpha 0.05 (Very transparent)
            borderColor: 'transparent',
            borderWidth: 0,
            hoverBackgroundColor: `rgba(${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b}, 0.1)`,
            hoverBorderWidth: 0,
            // Meta
            displayId: d.displayId, segment: d.segment, realF: d.realF, realM: d.realM, days: d.days
        }));

        // Dataset 2: Inner Core (Small, More Solid -> "Darker", No Stroke)
        const coreData = baseData.map(d => ({
            x: d.x, y: d.y,
            r: d.baseSize * 0.60, // Core Radius
            backgroundColor: `rgba(${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b}, 0.6)`, // Alpha 0.6 (More solid/darker)
            borderColor: 'transparent', // No Stroke
            borderWidth: 0,
            hoverBackgroundColor: `rgba(${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b}, 0.9)`,
            hoverBorderColor: '#fff',
            hoverBorderWidth: 1,
            // Meta
            displayId: d.displayId, segment: d.segment, realF: d.realF, realM: d.realM, days: d.days
        }));

        const scalesOptions = {
            x: {
                title: { display: true, text: '回診頻次 (F)', color: '#cbd5e1', font: { size: isMobile ? 12 : 14, weight: 'bold' } },
                grid: { color: 'rgba(255,255,255,0.08)', tickLength: 10 },
                ticks: { color:'#e2e8f0', font: { size: isMobile ? 10 : 12, weight: 'bold' } },
                border: { color: '#64748b' },
                min: 0,
                max: maxF, 
            },
            y: {
                title: { display: true, text: '消費金額 M (NT$)', color: '#cbd5e1', font: { size: isMobile ? 12 : 14, weight: 'bold' } },
                grid: { color: 'rgba(255,255,255,0.08)' },
                ticks: { 
                    color:'#e2e8f0',
                    font: { size: isMobile ? 10 : 12, weight: 'bold' },
                    callback: (v: number) => formatCompactNT(v)
                },
                border: { color: '#64748b' },
                min: 0,
                max: maxM, 
            }
        };

        // [Fix] Wait for Container Dimensions before creating chart
        const checkDimension = (count: number) => {
             const container = modal!.querySelector('.rfm-chart-inner');
             if (!container) return;
             
             const rect = container.getBoundingClientRect();
             if (rect.height > 0 && rect.width > 0) {
                 createOrUpdateChart("rfmModalCanvas", ctx, {
                    type: 'bubble',
                    data: {
                        datasets: [
                            {
                                label: 'Halo',
                                data: haloData,
                                backgroundColor: (ctx: any) => ctx.raw?.backgroundColor,
                                borderColor: 'transparent',
                                borderWidth: 0,
                                hoverRadius: 0, // Disable hover on halo to avoid confusion? Or sync? Let's just let it be.
                                hitRadius: 0 // Make Halo unclickable to favor Core?
                            },
                            {
                                label: 'Core',
                                data: coreData,
                                backgroundColor: (ctx: any) => ctx.raw?.backgroundColor,
                                borderColor: (ctx: any) => ctx.raw?.borderColor,
                                borderWidth: (ctx: any) => ctx.raw?.borderWidth,
                                hoverRadius: isMobile ? 6 : 10, 
                                hitRadius: isMobile ? 14 : 10, 
                                hoverBorderWidth: isMobile ? 2 : 2,
                                hoverBorderColor: '#fff'
                            }
                        ]
                    },
                    plugins: [{
                        id: 'quadrants-bg',

                beforeDraw: (chart: any) => {
                    const { ctx, scales: { x, y } } = chart;
                    if (!x || !y) return;

                    const top = y.top, bottom = y.bottom, left = x.left, right = x.right;
                    const midX = x.getPixelForValue(q80_f);
                    const midY = y.getPixelForValue(q80_m);

                    ctx.save();
                    
                    // High Contrast Quadrants
                    // VIP (Blue)
                    ctx.fillStyle = 'rgba(14, 165, 233, 0.1)'; ctx.fillRect(midX, top, right - midX, midY - top);
                    // Potential (Green)
                    ctx.fillStyle = 'rgba(34, 197, 94, 0.08)'; ctx.fillRect(left, top, midX - left, midY - top);
                    // Sleepy (Orange)
                    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)'; ctx.fillRect(midX, midY, right - midX, bottom - midY);
                    // Lost (Gray)
                    ctx.fillStyle = 'rgba(100, 116, 139, 0.05)'; ctx.fillRect(left, midY, midX - left, bottom - midY);

                    // Threshold Lines (Brighter)
                    ctx.beginPath();
                    ctx.moveTo(midX, top); ctx.lineTo(midX, bottom);
                    ctx.moveTo(left, midY); ctx.lineTo(right, midY);
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 6]);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    // Quadrant Labels (Pill Style High Visibility)
                    const label = (text: string, tx: number, ty: number, color: string, align: 'left'|'right') => {
                        // [Mobile Fix] Adjust quadrant labels font size
                        const labelFontCheck = isMobile ? 'bold 12px "Inter", sans-serif' : 'bold 15px "Inter", sans-serif';
                        ctx.font = labelFontCheck;
                        ctx.textBaseline = 'middle';
                        const paddingX = isMobile ? 8 : 12;
                        const paddingY = isMobile ? 4 : 6;
                        const paramWidth = ctx.measureText(text).width + (paddingX * 2);
                        const paramHeight = isMobile ? 26 : 32;
                        
                        // Prevent label clipping near edges if mobile
                        const offsetX = align === 'right' ? -paramWidth : 0;
                        const bgX = tx + offsetX;
                        const bgY = ty - paramHeight/2;

                        // Pill Shadow
                        ctx.shadowColor = 'rgba(0,0,0,0.5)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 4;
                        
                        // Pill Bg
                        ctx.fillStyle = '#1e293b'; 
                        ctx.beginPath();
                        ctx.roundRect(bgX, bgY, paramWidth, paramHeight, 8);
                        ctx.fill();
                        
                        // Reset Shadow
                        ctx.shadowColor = 'transparent';
                        
                        // Border
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        // Text
                        ctx.textAlign = 'left'; // Always draw relative to box start
                        ctx.fillStyle = '#f1f5f9'; 
                        const textX = bgX + paddingX;
                        ctx.fillText(text, textX, ty);
                    };

                    label('💎 核心 VIP', right - 20, top + 40, '#38bdf8', 'right');
                    label('🌱 潛力新客', left + 20, top + 40, '#4ade80', 'left');
                    label('💤 沈睡客群', right - 20, bottom - 40, '#fbbf24', 'right');
                    label('🌫️ 流失/過客', left + 20, bottom - 40, '#94a3b8', 'left');

                    ctx.restore();
                }
            }],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 2, 
                layout: { padding: isMobile ? 10 : 20 },
                animation: isMobile ? false : { duration: 800 },
                scales: scalesOptions,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleFont: { size: isMobile ? 12 : 14, weight: 'bold' },
                        bodyFont: { size: isMobile ? 11 : 13 },
                        padding: isMobile ? 8 : 12,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.2)',
                        callbacks: {
                            label: (ctx: any) => {
                                const r = ctx.raw._raw;
                                return ` ID: ${r.id} | $${r.m.toLocaleString()} | ${r.f}次 | 未訪:${r.days}天`;
                            }
                        }
                    }
                }
            }
        });

        // Force Resize
        const chartInstance = Chart.getChart("rfmModalCanvas");
        if (chartInstance) {
            applyRFMBubbleScrollFallback();
            chartInstance.resize();
            chartInstance.update('none');
        }
             } else {
                 if (count < 20) requestAnimationFrame(() => checkDimension(count + 1));
             }
        };

        // Start polling for dimension
        checkDimension(0);
    };

    // 4. Render Buttons
    filterGroup.innerHTML = '';
    filters.forEach(f => {
        const btn = document.createElement('button');
        btn.innerHTML = `${f.label}`;
        btn.id = `filter-btn-${f.id}`;
        
        // Base Styles
        const baseStyle = `
            background: transparent;
            border: 1px solid ${f.color}40; /* 25% opacity border */
            color: ${f.color};
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            font-family: inherit;
        `;
        btn.style.cssText = baseStyle;

        // Hover Effect
        btn.onmouseenter = () => {
             if (currentFilter !== f.id) {
                 btn.style.background = 'rgba(255,255,255,0.05)';
                 btn.style.borderColor = f.color;
             }
        };
        btn.onmouseleave = () => {
             if (currentFilter !== f.id) {
                 btn.style.background = 'transparent';
                 btn.style.borderColor = `${f.color}40`;
             }
        };

        // Click Handler
        btn.onclick = () => {
            currentFilter = f.id;
            renderChart(f.id);
            updateButtonStates();
            
            // Re-check scroll on filter change
            setTimeout(() => {
                applyRFMBubbleScrollFallback();
                const chartInstance = Chart.getChart("rfmModalCanvas");
                if (chartInstance) { 
                    chartInstance.resize(); 
                    chartInstance.update();
                }
            }, 50);
        };

        filterGroup.appendChild(btn);
    });

    // Helper to update visual state
    function updateButtonStates() {
        filters.forEach(f => {
            const b = filterGroup.querySelector(`#filter-btn-${f.id}`) as HTMLElement;
            if(!b) return;
            
            if (f.id === currentFilter) {
                b.style.background = f.activeBg; // Solid color
                b.style.color = f.activeText; // White text
                b.style.borderColor = f.activeBg;
                b.style.boxShadow = `0 0 15px ${f.activeBg}66`; // Glow
                b.style.transform = 'translateY(-1px)';
            } else {
                b.style.background = 'transparent';
                b.style.color = f.color;
                b.style.border = `1px solid ${f.color}40`;
                b.style.boxShadow = 'none';
                b.style.transform = 'none';
            }
        });
    }

    // Initial Render
    // Initial Render
    updateButtonStates();
    renderChart('all');

    // [New] ResizeObserver to handle dynamic resizing robustly
    const chartContainer = modal.querySelector('.rfm-chart-inner');
    if (chartContainer) {
        const ro = new ResizeObserver(() => {
            const chartInstance = Chart.getChart("rfmModalCanvas");
            if (chartInstance) {
                chartInstance.resize();
            }
        });
        ro.observe(chartContainer);
    }
}

function renderRFMLegend(container: HTMLElement | null) {
    if (!container) return;
    let legend = container.querySelector('.rfm-legend') as HTMLElement;
    if (!legend) {
        legend = document.createElement('div');
        legend.className = 'rfm-legend';
        legend.style.cssText = "display: flex; gap: 15px; justify-content: flex-end; font-size: 0.8rem; color: #666; margin-top: 10px;";
        container.appendChild(legend);
    }
    
    legend.innerHTML = `
        <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; background:#10b981; border-radius:50%;"></span> 活躍 (<60天)</div>
        <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; background:#f59e0b; border-radius:50%;"></span> 沉睡警示 (60-120天)</div>
        <div style="display:flex; align-items:center; gap:5px;"><span style="width:10px; height:10px; background:#ef4444; border-radius:50%;"></span> 流失 (>120天)</div>
    `;
}
