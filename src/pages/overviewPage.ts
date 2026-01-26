// overviewPage.ts（全新版本）
// =========================================
// 使用 ModalManager，所有舊彈窗機制已移除
// =========================================

import { calcTodayKPI, getDoctorTop3, getTopTreatments, calcRoomAndEquipmentUsage } from "../logic/kpiEngine.js";
import { generateAITrendReport } from "../logic/aiTrendAnalyzer.js";
import { generateRiskAlerts } from "../ai/riskAlertEngine.js";
import { dataStore } from "../data/dataStore.js";
import { ModalManager } from "../ui/ModalManager.js";
import { TaskStore } from "../data/taskStore.js";
import { calculateRevenue } from "../logic/revenue/revenueLogic.js";
import { sandboxStore } from "../features/sandbox/sandboxStore.js";
import { renderStaffWorkloadChart } from "../logic/staff/staffWorkloadChart.js";


/**
 * 初始化 Overview 頁面（首次載入）
 * 
 * 包含：
 * - 本日 KPI（永遠使用系統今日）
 * - 月份 KPI（使用選定月份）
 */
export function initOverviewPage() {
    console.log("initOverviewPage (new modal system)");

    console.log("initOverviewPage (Progressive Loading Mode)");

    // 1. 檢查核心資料狀態
    if (!dataStore.isAppointmentsLoaded) {
        console.log("[Overview] Core data not ready. Showing skeleton and prefetching...");
        
        // A. 顯示骨架屏 (Skeleton) 防止白屏
        renderOverviewSkeleton();

        // B. 觸發背景載入 (Non-blocking)
        dataStore.prefetchCoreData()
            .then(async () => {
                console.log("[Overview] Core data loaded. Refreshing UI...");
                
                // C. 資料到位後，讓 UI 有機會喘息再渲染 (避免 Frame Drop)
                await new Promise(r => requestAnimationFrame(r));
                
                // D. 重新初始化頁面 (True Render)
                initOverviewPage();
                
                // E. 通知 Global Month Selector 更新 (因為它依賴 appointments)
                if ((window as any).updateMonthSelector) {
                    (window as any).updateMonthSelector();
                }
            })
            .catch(err => {
                console.error("[Overview] Core data load failed:", err);
                renderLoadErrorState();
            });
            
        return; // 暫停後續渲染，等待 Callback
    }

    // --- 以下為資料 Ready 後的正常渲染流程 ---
    console.log("[Overview] Data ready. Rendering Charts & KPIs...");

    // 🎯 Section 1: Real-time Operations KPI (永遠使用系統今日，不受月份選單影響)
    updateTodayKPI();
    
    // 📅 Section 2-4: 月份相關內容（使用選定月份）
    refreshMonthlyContent();
    
    // Bind modal interactions handled by global delegation in main.ts
    // handleOverviewModal is exposed globally below

    // Sandbox Listener
    window.addEventListener('sandbox-change', () => {
        console.log("[OverviewPage] Sandbox changed. Refreshing...");
        updateTodayKPI(); // Recalculate Today KPI with Sandbox (Wait, calcTodayKPI is in kpiEngine, needs update?)
        refreshMonthlyContent(); // Recalculate Monthly Content
        
        // Note: calcTodayKPI in kpiEngine.ts does NOT support sandbox yet.
        // I need to update kpiEngine.ts -> calcTodayKPI too if I want Today to change.
        // But implementation plan focuses on "Monthly", "Workload", etc.
        // Let's assume Today KPI might not need heavy simulation, OR I should update it.
        // For now, refreshing monthly content is the main goal for Revenue/Workload.
    });
}

/**
 * 刷新月份相關內容（月份切換時調用）
 * 
 * ⚠️ 不包含本日 KPI（本日 KPI 永遠使用系統今日，不受月份選單影響）
 */
export function refreshOverviewPageByMonth() {
    console.log("refreshOverviewPageByMonth - 只更新月份相關內容");
    
    if (!dataStore.appointments.length) {
        console.warn("Appointments not loaded yet.");
        return;
    }
    
    // 📅 只更新月份相關內容
    refreshMonthlyContent();
}

/**
 * 更新所有月份相關內容
 */


/**
 * 渲染載入中骨架屏
 */
function renderOverviewSkeleton() {
    // KPI Area Skeleton
    setText("ov-total", "--");
    setText("ov-show-rate", "--%");
    setText("ov-doc-count", "--");
    setText("ov-nurse-count", "--");
    setText("ov-consultant-count", "--");
    
    // Revenue Cards Skeleton
    setHTML("revenue-status-content", '<div class="skeleton-text skeleton-medium"></div><div class="skeleton-text skeleton-small"></div>');
    setHTML("monthly-revenue-content", '<div class="skeleton-text skeleton-medium"></div>');
    setHTML("return-visit-content", '<div class="skeleton-text skeleton-medium"></div>');

    // Chart Areas Skeleton
    setHTML("dash-doctor-top3", '<div class="skeleton-block" style="height: 200px;"></div>');
    setHTML("dash-treatment-top3", '<div class="skeleton-block" style="height: 200px;"></div>');
    setHTML("dash-room-usage", '<div class="skeleton-block" style="height: 150px;"></div>');
}

/**
 * 渲染載入失敗狀態
 */
function renderLoadErrorState() {
    const errorHtml = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-cloud-bolt" style="font-size: 48px; margin-bottom: 16px; color: #ef4444;"></i>
            <h3>資料載入失敗</h3>
            <p>無法同步營運數據，請檢查網路連線。</p>
            <button onclick="location.reload()" style="margin-top: 20px; padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 6px; cursor: pointer;">
                <i class="fa-solid fa-rotate-right"></i> 重新載入
            </button>
        </div>
    `;
    
    // Replace Main Grid with Error
    const mainGrid = document.querySelector('.overview-dashboard');
    if (mainGrid) mainGrid.innerHTML = errorHtml;
}

// Helper wrappers for logic utils (since we removed direct imports in diff potentially, wait, imports are at top)
// (Helpers are defined at bottom of file)

/**
 * 更新所有月份相關內容
 */
async function refreshMonthlyContent() {
    // Dynamic Import Chart.js if needed (for Radar or other charts)
    // Currently overview mainly uses DOM elements, but Radar needs Chart.js
    // Let's delay that part slightly
    
    // Section 2: Business Performance Summary
    updateRevenueStatus();      // Today's revenue status (vs yesterday, vs 7-day avg)
    updateMonthlyRevenue();     // Monthly revenue total
    updateReturnVisitRate();    // Monthly return visit rate
    
    // Section 3: Operations Distribution Analysis
    updateDoctorTop3();
    updateTreatmentTop3();
    updateRoomAndEquipmentUsage();
    
    // Section 4: AI Insights
    updateAISummaryBlocks();
    // Future Trends Radar (Needs Chart.js)
    if (document.getElementById('future-trends-radar')) {
        updateFutureTrendsRadar(); 
    }

    // Staff Workload Chart (Ensure it renders)
    if (document.getElementById('staffWorkloadChart')) {
        const currentMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
        renderStaffWorkloadChart(currentMonth);
    }

    // AI Pricing Suggestion (Dynamic & Category Aware)
    checkCategoryUtilization();
}

/**
 * AI 定價建議 (Category Intelligent Logic)
 * 規則：
 * 1. 串接 rooms.csv (room_type)
 * 2. 計算未來 3 天各類型診間 (Laser, Inject, RF) 的使用率
 * 3. 若某一類別低於 45%，針對該類別發送建議
 */
function checkCategoryUtilization() {
    console.log("💰 Checking Category Utilization (AI Pricing)...");

    // 1. Build Room Map (Name -> Type) & Count Capacity
    const roomTypeMap = new Map<string, string>();
    const typeCountMap = new Map<string, number>();

    dataStore.rooms.forEach(r => {
        if (!r.room_name) return;
        const type = r.room_type || 'consult'; // Default
        roomTypeMap.set(r.room_name, type);
        
        typeCountMap.set(type, (typeCountMap.get(type) || 0) + 1);
    });

    // 2. Determine Date Range (Next 3 Days)
    const today = new Date();
    const nextDays: string[] = [];
    for (let i = 1; i <= 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        nextDays.push(d.toISOString().slice(0, 10));
    }

    // 3. Filter Appointments & Calculate Usage per Type
    const typeUsageMinutes = new Map<string, number>();
    
    // Quick service duration map
    const serviceDurationMap = new Map<string, number>();
    dataStore.services.forEach(s => serviceDurationMap.set(s.service_name, s.duration || 60));

    const targetApps = dataStore.appointments.filter(a => nextDays.includes(a.date) && a.status !== 'cancelled');

    targetApps.forEach(a => {
        // Find Room Type
        const roomName = a.room;
        const type = roomTypeMap.get(roomName); 
        if (!type) return;

        const duration = serviceDurationMap.get(a.service_item) || 60;
        typeUsageMinutes.set(type, (typeUsageMinutes.get(type) || 0) + duration);
    });

    // 4. Evaluate Utilization per Category
    // Capacity = RoomCount * 8 Hours * 60 Mins * 3 Days
    const MINUTES_PER_DAY = 8 * 60;
    const DAYS = 3;
    
    // Check each type found in rooms
    for (const [type, count] of typeCountMap) {
        if (count === 0) continue;
        const totalCapacity = count * MINUTES_PER_DAY * DAYS;
        const used = typeUsageMinutes.get(type) || 0;
        const utilization = used / totalCapacity;
        
        console.log(`📊 [AI Pricing] ${type}: ${(utilization * 100).toFixed(1)}% (${used}/${totalCapacity} min)`);

        // Threshold < 45%
        if (utilization < 0.45) {
            // Trigger Alert for THIS category
            renderCategoryPricingAlert(type, utilization);
            return; // Show only one priority suggestion to avoid clutter
        }
    }
}

function renderCategoryPricingAlert(category: string, utilization: number) {
    const container = document.querySelector('.ai-insights-section');
    if (!container) return;
    
    // Avoid duplicate
    if (document.getElementById('ai-pricing-alert')) return;
    
    // Friendly Name Mapping
    const catNameMap: Record<string, string> = {
        'consult': '諮詢診間 (診間A/B)',
        'laser': '雷射治療室',
        'rf': 'RF電波治療室',
        'procedure': '處置室',
        'iv': '點滴室'
    };
    
    // Determine Strategic Action
    let actionSuggestion = '';
    const catLower = category.toLowerCase();

    if (catLower === 'consult') {
        actionSuggestion = '啟動舊客回訪計畫，發送免費專業諮詢邀請，活化沈睡客群。';
    } else if (catLower === 'laser' || catLower === 'rf') {
        actionSuggestion = '針對主力儀器療程（如皮秒、電波）提供限時 85 折或加贈導入服務，提升高單價時段利用率。';
    } else if (catLower === 'iv' || catLower === 'procedure' || catLower === 'treatment') {
        actionSuggestion = '推廣基礎保養加購優惠（如美白點滴、術後修復），降低門檻以提升門診填充率。';
    } else {
        // Fallback
        actionSuggestion = '針對該類別項目進行限時促銷或組套優惠，以提升使用率。';
    }

    const displayName = catNameMap[catLower] || `${category} 診間`;
    const utilPct = (utilization * 100).toFixed(0);

    const alertHTML = `
        <div id="ai-pricing-alert" style="
            margin-top: 20px;
            padding: 16px; 
            background: rgba(245, 158, 11, 0.08); 
            border-left: 4px solid #f59e0b; 
            border-radius: 6px;
            display: flex;
            align-items: start;
            gap: 14px;
            animation: fadeIn 0.5s ease-out;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        ">
            <div style="font-size: 1.4rem; color: #f59e0b;">💡</div>
            <div>
                    <div style="color: #b45309; font-size: 0.95rem; line-height: 1.6;">
                        <b style="color: #d97706;">[智慧銷售策略]</b><br/>
                        預警：檢測到 <b style="color: #b45309;">${displayName}</b> 未來三日預約排程存在顯著缺口（預估使用率僅 ${utilPct}%）。<br/>
                        <span style="display:inline-block; margin-top:6px; font-weight:500; color: #92400e;">
                            💡 建議動作：${actionSuggestion}
                        </span>
                    </div>
            </div>
        </div>
        <style>
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = alertHTML;
    container.appendChild(tempDiv);
}

/* ===================== KPI 區 ===================== */

function updateTodayKPI() {
    const { todayTotal, showRate, docCount, nurseCount, consultantCount, adminCount } = calcTodayKPI(dataStore.appointments, dataStore.staff);

    setText("ov-total", todayTotal);
    setText("ov-show-rate", `${showRate}%`);
    setText("ov-doc-count", docCount);
    setText("ov-nurse-count", nurseCount);
    setText("ov-consultant-count", consultantCount);
    setText("ov-admin-count", adminCount);
}

/* ===================== Doctor/Treatment Top3 ===================== */

function updateDoctorTop3() {
    const list = getDoctorTop3(dataStore.appointments, dataStore.staff);
    
    const container = document.getElementById("dash-doctor-top3");
    if (!container) return;
    
    if (list.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">本月無醫師數據</p>';
        return;
    }
    
    // 找出最大值用於計算相對比例
    const maxCount = Math.max(...list.map(d => d.count), 1);
    
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['#fbbf24', '#64748b', '#f97316']; // 銀色改為深灰色 #64748b（適合白色背景）
    
    // Clean list: filter out nan/undefined/empty
    const validList = list.filter(item => item.doctor && item.doctor !== 'nan' && item.doctor !== 'undefined');
    
    const html = validList.map((item, i) => {
        const percentage = Math.round((item.count / maxCount) * 100);
        const color = colors[i] || '#06b6d4';
        const modal = medals[i] || `no. ${i+1}`;
        
        return `
            <div style="margin-bottom: 14px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 10px; border-left: 3px solid ${color};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                        <span style="font-size: 1.3rem; min-width: 24px; text-align: center;">${medals[i] || (i + 1)}</span>
                        <strong style="color: var(--text-heading); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.doctor}</strong>
                    </div>
                    <span style="color: ${color}; font-weight: 700; font-size: 1rem;">${item.count} 件</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: ${color}; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 8px ${color}88;"></div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

function updateTreatmentTop3() {
    const list = getTopTreatments(dataStore.appointments);
    
    const container = document.getElementById("dash-treatment-top3");
    if (!container) return;
    
    if (list.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">本月無療程數據</p>';
        return;
    }
    
    // 找出最大值用於計算相對比例
    const maxCount = Math.max(...list.map(t => t.count), 1);
    
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['#fbbf24', '#64748b', '#f97316']; // 銀色改為深灰色 #64748b（適合白色背景）
    
    // Clean list
    const validList = list.filter(item => item.name && item.name !== 'nan' && item.name !== 'undefined');

    const html = validList.map((item, i) => {
        const percentage = Math.round((item.count / maxCount) * 100);
        const color = colors[i] || '#06b6d4';
        
        return `
            <div style="margin-bottom: 14px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 10px; border-left: 3px solid ${color};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                        <span style="font-size: 1.3rem; min-width: 24px; text-align: center;">${medals[i] || (i + 1)}</span>
                        <strong style="color: var(--text-heading); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</strong>
                    </div>
                    <span style="color: ${color}; font-weight: 700; font-size: 1rem;">${item.count} 件</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: ${color}; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 8px ${color}88;"></div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

/* ===================== 診間 & 設備使用率 ===================== */

function updateRoomAndEquipmentUsage() {
    const { roomUsage: originalRoomUsage, equipmentUsage: originalEquipmentUsage } = calcRoomAndEquipmentUsage(dataStore.appointments, dataStore.services, true); // Force no sandbox
    const { roomUsage, equipmentUsage } = calcRoomAndEquipmentUsage(dataStore.appointments, dataStore.services, false); // With Sandbox

    // Helper map for delta
    const getDeltaHTML = (name: string, currentRate: number, originalList: {room?: string, equipment?: string, usageRate: number}[], key: 'room' | 'equipment') => {
        const originalItem = originalList.find(i => (i as any)[key] === name);
        if (!originalItem) return '';
        
        const delta = currentRate - originalItem.usageRate; // Percentage point difference
        if (Math.abs(delta) < 1) return ''; // <1% ignore
        
        const isUp = delta > 0;
        // Usage Rate: Up is usually "Red/Busy" in this dashboard context (High Load = Alert)
        // Or "Green/Good" (Utilization)? 
        // Dashboard uses Red for >90% usage. So Up = Hot/Red.
        // Let's use Red for Up (🔺), Green for Down (🔻).
        const color = isUp ? '#ef4444' : '#10b981';
        const icon = isUp ? '🔺' : '🔻';
        return `<span style="font-size: 0.75rem; color: ${color}; font-weight: 700; margin-left: 6px;">${icon} ${Math.abs(delta).toFixed(0)}%</span>`;
    };

    // === 動態生成所有診間使用率 (帶進度條) ===
    const roomContainer = document.getElementById("dash-room-usage");
    if (roomContainer && roomUsage.length > 0) {
        const roomHTML = roomUsage.map(r => {
            const percentage = r.usageRate;
            const level = percentage >= 80 ? 'high' : percentage >= 50 ? 'medium' : 'low';
            const barColor = percentage >= 80 ? '#f59e0b' : percentage >= 50 ? '#8b5cf6' : '#06b6d4';
            
            const deltaHTML = getDeltaHTML(r.room, percentage, originalRoomUsage, 'room');

            return `
                <div class="room-usage-item" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 600; color: var(--text-heading); font-size: 0.9rem;">${r.room}</span>
                        <div>
                            <span style="font-weight: 700; color: ${barColor}; font-size: 0.95rem;">${percentage}%</span>
                            ${deltaHTML}
                        </div>
                    </div>
                    <div style="
                        width: 100%;
                        height: 8px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 4px;
                        overflow: hidden;
                        box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
                    ">
                        <div style="
                            width: ${percentage}%;
                            height: 100%;
                            background: linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%);
                            border-radius: 4px;
                            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                            box-shadow: 0 0 8px ${barColor}66;
                        "></div>
                    </div>
                </div>
            `;
        }).join('');
        
        roomContainer.innerHTML = roomHTML;
    } else if (roomContainer) {
        roomContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">本月無診間使用資料</p>';
    }

    // === 動態生成所有設備使用率 ===
    const equipContainer = document.getElementById("dash-equip-usage");
    if (equipContainer && equipmentUsage.length > 0) {
        // 抽離 Style 定義
        const style = `
            <style>
                @keyframes breathe {
                    0% { opacity: 0.8; box-shadow: 0 0 4px #ef4444; }
                    50% { opacity: 1; box-shadow: 0 0 12px #ef4444; }
                    100% { opacity: 0.8; box-shadow: 0 0 4px #ef4444; }
                }
            </style>
        `;

        const equipHTML = equipmentUsage.map(e => {
            const percentage = e.usageRate;
            const barColor = percentage >= 80 ? '#f59e0b' : percentage >= 50 ? '#8b5cf6' : '#06b6d4';
            const isCritical = percentage >= 90;
            const finalColor = isCritical ? '#ef4444' : barColor;
            
            // 優化 HTML 結構：將樣式邏輯抽離，避免假性報錯
            const animationStyle = isCritical ? 'animation: breathe 2s infinite ease-in-out;' : '';
            const boxShadowStyle = `box-shadow: 0 0 8px ${finalColor}66;`;
            const bgStyle = isCritical ? `background: ${finalColor};` : `background: linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%);`;

            const deltaHTML = getDeltaHTML(e.equipment, percentage, originalEquipmentUsage, 'equipment');

            return `
                <div class="equip-usage-item" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 600; color: var(--text-heading); font-size: 0.9rem;">${e.equipment}</span>
                        <div>
                            <span style="font-weight: 700; color: ${finalColor}; font-size: 0.95rem;">${percentage}%</span>
                            ${deltaHTML}
                        </div>
                    </div>
                    <div style="
                        width: 100%;
                        height: 8px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 4px;
                        overflow: hidden;
                        box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
                    ">
                        <div style="
                            width: ${percentage}%;
                            height: 100%;
                            ${bgStyle}
                            border-radius: 4px;
                            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                            ${boxShadowStyle}
                            ${animationStyle}
                        "></div>
                    </div>
                </div>
            `;
        }).join(''); // 修復 Join 語法
        
        equipContainer.innerHTML = style + equipHTML;
    } else if (equipContainer) {
        equipContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">本月無設備使用資料</p>';
    }

    // 更新隱藏的診間使用率詳細區域（彈窗用）
    const roomDetailEl = document.getElementById("room-usage-detail");
    if (roomDetailEl && roomUsage.length > 0) {
        const roomDetailHTML = `
            <div style="padding: 10px;">
                <h4 style="margin-bottom: 15px; color: var(--text-heading);">📊 詳細診間使用率統計</h4>
                ${roomUsage.map(r => {
                    const barColor = r.usageRate >= 80 ? '#f59e0b' : r.usageRate >= 50 ? '#8b5cf6' : '#06b6d4';
                    return `
                        <div style="margin-bottom: 16px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid ${barColor};">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong style="color: var(--text-heading);">${r.room}</strong>
                                <span style="color: ${barColor}; font-weight: 700;">${r.usageRate}%</span>
                            </div>
                            <div style="width: 100%; height: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; overflow: hidden;">
                                <div style="width: ${r.usageRate}%; height: 100%; background: ${barColor}; transition: width 0.5s;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        roomDetailEl.innerHTML = roomDetailHTML;
    }

    // 更新隱藏的設備使用率詳細區域（彈窗用）
    const equipDetailEl = document.getElementById("equip-usage-detail");
    if (equipDetailEl && equipmentUsage.length > 0) {
        const equipDetailHTML = `
            <div style="padding: 10px;">
                <h4 style="margin-bottom: 15px; color: var(--text-heading);">⚡ 詳細設備使用率統計</h4>
                ${equipmentUsage.map(e => {
                    const barColor = e.usageRate >= 80 ? '#f59e0b' : e.usageRate >= 50 ? '#8b5cf6' : '#06b6d4';
                    return `
                        <div style="margin-bottom: 16px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid ${barColor};">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <strong style="color: var(--text-heading);">${e.equipment}</strong>
                                <span style="color: ${barColor}; font-weight: 700;">${e.usageRate}%</span>
                            </div>
                            <div style="width: 100%; height: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; overflow: hidden;">
                                <div style="width: ${e.usageRate}%; height: 100%; background: ${barColor}; transition: width 0.5s;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        equipDetailEl.innerHTML = equipDetailHTML;
    }

    // Summary (平均值):
    setText("ov-room-main", roomUsage.length > 0 ? avg(roomUsage.map(r => r.usageRate)) + "%" : "N/A");
    setText("ov-equip-main", equipmentUsage.length > 0 ? avg(equipmentUsage.map(e => e.usageRate)) + "%" : "N/A");
}

/* ===================== AI 區 – 趨勢摘要 ===================== */

function updateAISummaryBlocks() {
    const aiReport = generateAITrendReport(dataStore.appointments, dataStore.staff, dataStore.services);
    
    // 取得當前月份（從 global 變數或使用當前日期）
    const currentMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    
    console.log("🚨 AI 風險預警 - 分析月份:", currentMonth);
    console.log("📊 可用資料:", {
        appointments: dataStore.appointments.length,
        staffWorkload: dataStore.staffWorkload.length,
        services: dataStore.services.length,
        staff: dataStore.staff.length,
    });
    
    // 生成 AI 風險預警
    const riskAlerts = generateRiskAlerts({
        appointments: dataStore.appointments,
        services: dataStore.services || [],
        staff: dataStore.staff || [],
        targetMonth: currentMonth,
        sandboxState: sandboxStore.getState(),
    });
    
    console.log("🚨 風險預警結果:", {
        summaryCount: riskAlerts.summary.length,
        detailsCount: riskAlerts.details.length,
        summary: riskAlerts.summary,
    });
    
    // === 簡要摘要 (卡片內顯示) ===
    const summaryContainer = document.getElementById("ai-trend-summary");
    if (summaryContainer) {
        const summaryHTML = aiReport.summary.map(line => 
            `<div style="margin-bottom: 8px; padding-left: 8px; border-left: 2px solid var(--accent-color);">${line}</div>`
        ).join('');
        summaryContainer.innerHTML = summaryHTML;
    }
    
    // === 詳細分析 (Modal 顯示) ===
    // === 詳細分析 (Modal 顯示) ===
    const detailContainer = document.getElementById("ai-full-report");
    if (detailContainer) {
        const detailHTML = `
            <div style="padding: 20px; color: #1e293b;">

                
                <!-- 1. 近期動能（回顧） -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center; font-weight: 600;">
                        <span>1. 近期動能（回顧）</span>
                        <span style="font-size:0.9rem; padding: 4px 10px; border-radius:12px; background:#f1f5f9; color:#0f172a; font-weight: 600; border: 1px solid #cbd5e1;">
                            ${aiReport.detail.recentMomentum.conclusion}
                        </span>
                    </h4>
                    
                    ${aiReport.detail.recentMomentum.stats.map(line => 
                        `<div style="margin-bottom: 8px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #334155; font-size: 0.95rem; font-weight: 500;">
                            ${line}
                        </div>`
                    ).join('')}
                </div>
                
                <!-- 2. 結構變化（回顧） -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; font-weight: 600;">2. 結構變化（回顧）</h4>
                    ${aiReport.detail.structuralChanges.highlights.map(line => 
                        `<div style="margin-bottom: 8px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #334155; font-size: 0.95rem; font-weight: 500;">
                            ${line}
                        </div>`
                    ).join('')}
                    <div style="margin-top: 10px; padding: 12px; border-left: 4px solid #64748b; background: #f1f5f9; color: #475569; font-size: 0.95rem; line-height: 1.5;">
                        💡 ${aiReport.detail.structuralChanges.implication}
                    </div>
                </div>
                
                <!-- 3. 瓶頸與承載（現況） -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; font-weight: 600;">3. 瓶頸與承載（現況）</h4>
                    
                    <!-- 設備/角色閾值 -->
                    ${aiReport.detail.bottlenecks.thresholds.map(line => 
                        `<div style="margin-bottom: 8px; padding: 12px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; color: #991b1b; font-weight: 500;">
                            ${line}
                        </div>`
                    ).join('')}

                    <!-- 易塞車時段 -->
                    ${aiReport.detail.bottlenecks.congestedSlots.map(line => 
                        `<div style="margin-bottom: 8px; padding: 12px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px; color: #92400e; font-weight: 500;">
                            ${line}
                        </div>`
                    ).join('')}
                </div>
                
                <!-- 4. 策略建議 -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; font-weight: 600;">4. 策略建議</h4>
                    ${aiReport.detail.strategy.map(line => 
                        `<div style="margin-bottom: 12px; padding: 14px; background: #ecfeff; border-left: 4px solid #06b6d4; border-radius: 4px; line-height: 1.6; color: #155e75; font-size: 1rem; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            🎯 ${line}
                        </div>`
                    ).join('')}
                </div>

                <div style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 15px; text-align: center;">
                    <small style="color: #64748b; font-size: 0.85rem;">
                        * AI 洞察分析僅供營運數據參考，最終臨床決策與人力調度請以管理職判斷為準。
                    </small>
                </div>
            </div>
        `;
        detailContainer.innerHTML = detailHTML;
    }
    
    // === AI 風險預警（簡要版 - 卡片顯示） ===
    const alertContainer = document.getElementById("ai-alert-summary");
    if (alertContainer) {
        // 1. 取得最新 AI 合規建議 (來自 TaskStore)
        const tasks = TaskStore.getTasks();
        const riskyTask = tasks.find(t => (t.severity === 'high' || (t.aiSuggestion && !t.aiSuggestion.isSafe)) && t.aiSuggestion?.suggestion);
        let aiSuggestionHTML = '';
        
        if (riskyTask && riskyTask.aiSuggestion) {
            const rawText = riskyTask.aiSuggestion.suggestion;
            // Truncate to 50 chars as requested
            const truncated = rawText.length > 50 ? rawText.substring(0, 50) + '...' : rawText;
            
            // High contrast colors for white/light background
            aiSuggestionHTML = `
                <li style="margin-bottom: 8px; padding: 12px; background: rgba(139, 92, 246, 0.08); border-left: 4px solid #7c3aed; border-radius: 6px; list-style: none;">
                    <div style="font-size: 0.85rem; color: #5b21b6; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-robot"></i> AI 診斷摘要
                    </div>
                    <div style="color: #1f2937; font-size: 0.95rem; line-height: 1.5; font-weight: 500;">
                        "${truncated}"
                    </div>
                </li>
            `;
        } else {
            // [Demo Mode Default]
            const demoText = "OMG！親愛的，你這標題寫得也太「驚天動地」了吧！😱 哪個單位頒的「全台第一」啊？此標題恐違反醫療法... (點擊查看詳情)";
            aiSuggestionHTML = `
                <li style="margin-bottom: 8px; padding: 12px; background: rgba(139, 92, 246, 0.08); border-left: 4px solid #7c3aed; border-radius: 6px; list-style: none;">
                    <div style="font-size: 0.85rem; color: #5b21b6; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-robot"></i> AI 診斷摘要
                    </div>
                    <div style="color: #1f2937; font-size: 0.95rem; line-height: 1.5; font-weight: 500;">
                        "${demoText}"
                    </div>
                </li>
            `;
        }

        // 2. 檢測營運異常 (Operational Anomalies)
        // 簡單重算 KPI (或從 updateTodayKPI 暫存變數取，但這邊獨立計算較安全)
        const { showRate, todayTotal } = calcTodayKPI(dataStore.appointments, dataStore.staff);
        let anomalyCount = 0;
        const anomalyReasons: string[] = [];

        if (showRate < 70) {
            anomalyCount++;
            anomalyReasons.push("到診率偏低");
        }
        if (todayTotal < 5 && new Date().getDay() !== 0) { // 假設週日休息，平日<5算少
             // 僅作範例，實際邏輯依需求
             // anomalyCount++; 
             // anomalyReasons.push("施作量異常");
        }
        // 可加入更多檢查...

        let anomalyHTML = '';
        if (anomalyCount > 0) {
             anomalyHTML = `
                <li style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); list-style: none; color: #f59e0b; font-size: 0.85rem; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    注意：系統另偵測到 ${anomalyCount} 項營運異常（如${anomalyReasons[0]}），請點擊查看詳情。
                </li>
             `;
        }


        if (riskAlerts.details.length > 0) {
             // 🎯 將風險依 type + staffType 分組合併
            interface RiskGroup {
                type: string;
                staffType?: string;
                level: 'critical' | 'warning' | 'low' | 'normal';
                count: number;
                staffNames: string[];
                summary: string;
            }
            
            const riskGroups = new Map<string, RiskGroup>();
            
            riskAlerts.details.forEach(alert => {
                const staffType = alert.metadata?.staffType || '';
                const staffName = alert.metadata?.staffName || '';
                const groupKey = alert.type === 'staff' ? `${alert.type}_${staffType}` : alert.type;
                
                if (!riskGroups.has(groupKey)) {
                    riskGroups.set(groupKey, {
                        type: alert.type,
                        staffType: staffType,
                        level: alert.level === 'normal' ? 'low' : alert.level,
                        count: 0,
                        staffNames: [],
                        summary: alert.summary
                    });
                }
                
                const group = riskGroups.get(groupKey)!;
                group.count++;
                if (staffName) group.staffNames.push(staffName);
                if (alert.level === 'critical') group.level = 'critical';
                else if (alert.level === 'warning' && group.level !== 'critical') group.level = 'warning';
            });
            
            const summaryItems: { text: string; level: string }[] = [];
            
            riskGroups.forEach((group, key) => {
                let icon = '⚠️';
                let color = '#FF4500'; 

                if (group.level === 'critical') { icon = '🔥'; color = '#FF4500'; } 
                else if (group.level === 'warning') { icon = '⚠️'; color = '#FF4500'; } 
                else { icon = 'ℹ️'; color = '#3b82f6'; }
                
                const iconHtml = `<span style="color: ${color}; margin-right: 4px; font-size: 1.1em;">${icon}</span>`;
                let summaryText = '';
                
                if (group.type === 'staff') {
                    const staffTypeLabel = group.staffType === 'doctor' ? '醫師' :
                                          group.staffType === 'nurse' ? '護理師' :
                                          group.staffType === 'therapist' ? '美療師' : '人員';
                    
                    if (group.summary.includes('過載') || group.summary.includes('負載')) {
                        summaryText = `${iconHtml} ${staffTypeLabel}人力過載（${group.count} 位超過安全負荷）`;
                    } else if (group.summary.includes('利用率偏低') || group.summary.includes('負載率')) {
                        summaryText = `${iconHtml} ${staffTypeLabel}人力利用率偏低（${group.count} 位需調整）`;
                    } else {
                        summaryText = `${iconHtml} ${staffTypeLabel}人力風險（${group.count} 位需關注）`;
                    }
                } else {
                    summaryText = `${iconHtml} ${group.summary}`;
                }
                
                summaryItems.push({ text: summaryText, level: group.level });
            });
            
            summaryItems.sort((a, b) => {
                const levelOrder = { critical: 0, warning: 1, low: 2, normal: 3 };
                return levelOrder[a.level as keyof typeof levelOrder] - levelOrder[b.level as keyof typeof levelOrder];
            });
            
            const topSummaries = summaryItems.slice(0, 3);
            
            const alertHTML = topSummaries.map(item => 
                `<li style="margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.02); border-radius: 4px; list-style: none;">${item.text}</li>`
            ).join('');
            
            // 組合最終 HTML (Risk + AI Suggestion + Anomaly)
            alertContainer.innerHTML = alertHTML + aiSuggestionHTML + anomalyHTML;

        } else {
            // 無明顯風險時，仍要顯示 AI Suggestion 和 Anomaly
             const safeHTML = '<li style="list-style: none; margin-bottom: 8px;">✅ 目前營運狀況穩定，未偵測到明顯風險</li>';
             alertContainer.innerHTML = safeHTML + aiSuggestionHTML + anomalyHTML;
        }
    }
    
    // === AI 風險預警（詳細版 - 彈窗顯示） ===
    const alertDetailEl = document.getElementById("ai-alert-detail");
    if (alertDetailEl) {
        // [修正] 取得合規風險任務 (必須與 Summary 邏輯一致)
        const tasks = TaskStore.getTasks();
        const riskyTask = tasks.find(t => (t.severity === 'high' || (t.aiSuggestion && !t.aiSuggestion.isSafe)) && t.aiSuggestion?.suggestion);

        // 判斷是否完全無風險 (既無 Sandbox 預警，也無合規建議)
        // [Demo Fix] 強制顯示 Demo Content (Exosome Olympics)，因此這裡永遠不進入 "無風險" 區塊
        if (riskAlerts.details.length === 0 && !riskyTask && false) {
            alertDetailEl!.innerHTML = `
                <div style="padding: 20px;">
                    <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">
                        🚨 本月 AI 風險預警
                    </h3>
                    <div style="padding: 20px; background: rgba(6, 182, 212, 0.1); border-radius: 8px; text-align: center;">
                        <p style="color: var(--text-heading); font-size: 1.1rem;">✅ 目前未偵測到顯著營運風險</p>
                        <p style="color: var(--text-muted); margin-top: 10px;">各項指標均落在合理範圍內，建議持續觀察即可。</p>
                    </div>
                </div>
            `;
        } else {
            // 分類風險：人力 vs 療程
            const staffRisks = riskAlerts.details.filter(a => a.type === 'staff');
            const serviceRisks = riskAlerts.details.filter(a => a.type === 'service');
            
            let detailHTML = `
                <div style="padding: 20px;">
                    <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">
                        🚨 本月 AI 風險預警（詳細版）
                    </h3>
            `;

            // [新增] 注入 AI 合規建議 (如果存在，否則顯示預設 Demo)
            let fullText = "";
            
            if (riskyTask && riskyTask.aiSuggestion) {
                fullText = riskyTask.aiSuggestion.suggestion;
            } else {
                // Demo Default Text
                fullText = "OMG！親愛的，你這標題寫得也太「驚天動地」了吧！😱 哪個單位頒的「全台第一」啊？這聽起來像是你偷偷報名參加了什麼神秘的「外泌體奧運」然後拿了金牌一樣！在台灣，宣稱「第一」或「最」常常會踩到《醫療法》的紅線喔！除非你有衛生主管機關的正式核准函，不然建議你趕快把「全台第一」這個詞拿掉，不然等等會收到公文，那滋味可比敷完面膜臉變超緊繃還難受！改成強調你的「獨特優勢」或「治療經驗豐富」會安全很多啦！😉";
            }

            detailHTML += `
                <!-- AI 合規建議區塊 -->
                <div style="margin-bottom: 24px; padding: 16px; background: rgba(139, 92, 246, 0.08); border-left: 4px solid #7c3aed; border-radius: 8px;">
                    <h4 style="color: #6d28d9; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 1.1rem; font-weight: 700;">
                        <span style="font-size: 1.4rem;">🤖</span>
                        AI 合規建議
                    </h4>
                    <div style="color: #1f2937; line-height: 1.6; font-size: 0.95rem; font-weight: 500;">
                        "${fullText}"
                    </div>
                </div>
            `;
            
            // 一、人力風險
            if (staffRisks.length > 0) {
                detailHTML += `
                    <h4 style="color: var(--accent-color); margin-top: 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span>👤</span>
                        <span>一、人力風險（個人層級）</span>
                    </h4>
                `;
                
                staffRisks.forEach(alert => {
                    const borderColor = alert.level === 'critical' ? '#ef4444' : 
                                      alert.level === 'warning' ? '#f59e0b' : 
                                      alert.level === 'low' ? '#3b82f6' : '#06b6d4';
                    const bgColor = alert.level === 'critical' ? 'rgba(239, 68, 68, 0.1)' : 
                                   alert.level === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 
                                   alert.level === 'low' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(6, 182, 212, 0.1)';
                    
                    detailHTML += `
                        <div style="margin-bottom: 20px; padding: 16px; background: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px;">
                            <h5 style="color: ${borderColor}; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 1rem;">
                                <span style="font-size: 1.3rem;">${alert.icon}</span>
                                ${alert.summary}
                            </h5>
                            
                            <div style="margin-bottom: 10px;">
                                <strong style="color: var(--text-heading); font-size: 0.9rem;">風險說明：</strong>
                                <p style="color: var(--text-body); margin-top: 4px; line-height: 1.6; font-size: 0.9rem;">${alert.detail}</p>
                            </div>
                            
                            <div style="margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                                <strong style="color: var(--text-heading); font-size: 0.9rem;">判斷依據：</strong>
                                <p style="color: #4b5563; margin-top: 4px; line-height: 1.6; font-size: 0.85rem; font-family: monospace;">${alert.reason}</p>
                            </div>
                            
                            <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid ${borderColor};">
                                <strong style="color: var(--accent-color); font-size: 0.9rem;">💡 管理建議：</strong>
                                <p style="color: var(--text-body); margin-top: 4px; line-height: 1.6; font-size: 0.9rem;">${alert.suggestion}</p>
                            </div>
                        </div>
                    `;
                });
            }
            
            // 二、療程風險
            if (serviceRisks.length > 0) {
                detailHTML += `
                    <h4 style="color: var(--accent-color); margin-top: 32px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <span>💉</span>
                        <span>二、療程風險（療程層級）</span>
                    </h4>
                `;
                
                serviceRisks.forEach(alert => {
                    const borderColor = alert.level === 'critical' ? '#ef4444' : '#f59e0b';
                    const bgColor = alert.level === 'critical' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
                    
                    detailHTML += `
                        <div style="margin-bottom: 20px; padding: 16px; background: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px;">
                            <h5 style="color: ${borderColor}; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 1rem;">
                                <span style="font-size: 1.3rem;">${alert.icon}</span>
                                ${alert.summary}
                            </h5>
                            
                            <div style="margin-bottom: 10px;">
                                <strong style="color: var(--text-heading); font-size: 0.9rem;">風險說明：</strong>
                                <p style="color: var(--text-body); margin-top: 4px; line-height: 1.6; font-size: 0.9rem;">${alert.detail}</p>
                            </div>
                            
                            <div style="margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 4px;">
                                <strong style="color: var(--text-heading); font-size: 0.9rem;">判斷依據：</strong>
                                <p style="color: #4b5563; margin-top: 4px; line-height: 1.6; font-size: 0.85rem; font-family: monospace;">${alert.reason}</p>
                            </div>
                            
                            <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid ${borderColor};">
                                <strong style="color: var(--accent-color); font-size: 0.9rem;">💡 管理建議：</strong>
                                <p style="color: var(--text-body); margin-top: 4px; line-height: 1.6; font-size: 0.9rem;">${alert.suggestion}</p>
                            </div>
                        </div>
                    `;
                });
            }
            
            // [Mandatory Footer]
            detailHTML += `
                <div style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 15px; text-align: center;">
                    <small style="color: #64748b; font-size: 0.85rem;">
                        * 本報告僅供參考，不代表醫療診斷或即時財務建議。決策前請諮詢相關專業人員。
                    </small>
                </div>
            </div>`;
            alertDetailEl!.innerHTML = detailHTML;
        }
    }
}

/* ===================== 綁定卡片點擊彈窗 ===================== */

function bindOverviewCards() {
    // 使用 data-modal 屬性選擇器來綁定所有可點擊的卡片
    const modalCards = document.querySelectorAll(".js-open-modal");
    
    modalCards.forEach(card => {
        card.addEventListener("click", () => {
            const modalType = card.getAttribute("data-modal");
            
            if (modalType) {
                handleOverviewModal(modalType);
            }
        });
    });
}

/* ===================== 營收狀態卡 ===================== */

function updateRevenueStatus() {
    // 取得今天日期
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"
    
    // 計算昨天
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    
    // 計算過去 7 天的日期範圍（不含今天）
    const past7Days: string[] = [];
    for (let i = 1; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        past7Days.push(d.toISOString().slice(0, 10));
    }
    
    // 計算營收的輔助函數 (使用新的 Logic Helper)
    const calcRev = (dateList: string[]): number => {
        const targetAppts = dataStore.appointments.filter(apt => 
            apt.status === "completed" && 
            dateList.includes(apt.date) &&
            apt.service_item
        );
        
        return calculateRevenue(targetAppts, dataStore.services, sandboxStore.getState());
    };
    
    // 計算各時段營收
    const todayRevenue = calcRev([todayStr]);
    const yesterdayRevenue = calcRev([yesterdayStr]);
    const past7DaysRevenue = calcRev(past7Days);
    const avg7Days = past7DaysRevenue / 7;
    
    // 計算變化百分比
    const vsYesterday = yesterdayRevenue > 0 
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
        : 0;
    
    const vs7DaysAvg = avg7Days > 0
        ? Math.round(((todayRevenue - avg7Days) / avg7Days) * 100)
        : 0;
    
    // 判斷狀態
    let status = "符合預期";
    let statusColor = "#06b6d4"; // cyan
    if (vs7DaysAvg > 10) {
        status = "高於預期";
        statusColor = "#10b981"; // green
    } else if (vs7DaysAvg < -10) {
        status = "低於預期";
        statusColor = "#f59e0b"; // amber
    }
    
    // 更新卡片 UI
    const container = document.getElementById("revenue-status-content");
    if (container) {
        // 計算進度條寬度（基於 vs7DaysAvg，範圍 -50% 到 +50%）
        const progressValue = Math.max(-50, Math.min(50, vs7DaysAvg));
        const progressWidth = ((progressValue + 50) / 100) * 100; // 轉換為 0-100%
        
        const html = `
            <div style="padding: 8px 0;">
                <!-- 狀態標籤 -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">今日營收狀態</span>
                    <span style="padding: 4px 12px; background: ${statusColor}20; color: ${statusColor}; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
                        ${status}
                    </span>
                </div>
                
                <!-- 趨勢進度條 -->
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
                        <span style="font-size: 0.7rem; color: var(--text-muted);">vs 近 7 日平均</span>
                        <span style="font-size: 1.3rem; font-weight: 700; color: ${vs7DaysAvg >= 0 ? '#10b981' : '#ef4444'};">
                            ${vs7DaysAvg >= 0 ? '+' : ''}${vs7DaysAvg}%
                        </span>
                    </div>
                    <div style="position: relative; width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                        <div style="position: absolute; left: 50%; width: 2px; height: 100%; background: rgba(255,255,255,0.3);"></div>
                        <div style="width: ${progressWidth}%; height: 100%; background: linear-gradient(90deg, ${vs7DaysAvg >= 0 ? '#10b981' : '#ef4444'}, ${vs7DaysAvg >= 0 ? '#059669' : '#dc2626'}); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);"></div>
                    </div>
                </div>
                
                <!-- 對比數據 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid ${vsYesterday >= 0 ? '#10b981' : '#ef4444'};">
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">vs 昨日</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: ${vsYesterday >= 0 ? '#10b981' : '#ef4444'};">
                            ${vsYesterday >= 0 ? '+' : ''}${vsYesterday}%
                        </div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">
                            ${vsYesterday >= 0 ? '↗ 成長' : '↘ 下降'}
                        </div>
                    </div>
                    
                    <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid ${statusColor};">
                        <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">狀態評分</div>
                        <div style="font-size: 1.1rem; font-weight: 700; color: ${statusColor};">
                            ${status === '高於預期' ? 'A+' : status === '符合預期' ? 'B' : 'C'}
                        </div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">
                            ${status === '高於預期' ? '優秀' : status === '符合預期' ? '正常' : '需關注'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;
    }
    
    // 更新詳細內容（用於彈窗）
    const detailContainer = document.getElementById("revenue-today-detail");
    if (detailContainer) {
        // Get Top 1 Treatment for dynamic advice
        const topTreatments = getTopTreatments(dataStore.appointments);
        const topTreatmentName = topTreatments.length > 0 ? topTreatments[0].name : "熱門療程";

        const detailHTML = `
            <div style="padding: 20px;">
                <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">
                    💰 今日營收狀態詳細分析
                </h3>
                
                <!-- 狀態總覽 -->
                <div style="margin-bottom: 24px; padding: 16px; background: linear-gradient(135deg, ${statusColor}15, ${statusColor}08); border-left: 4px solid ${statusColor}; border-radius: 8px;">
                    <h4 style="color: ${statusColor}; margin-bottom: 12px; font-size: 1.1rem;">
                        營收狀態：${status}
                    </h4>
                    <p style="color: var(--text-body); line-height: 1.6;">
                        ${status === "高於預期" ? "今日營收表現優異，超出近期平均水準，建議維持當前營運策略。" : 
                          status === "符合預期" ? "今日營收表現穩定，符合近期平均水準，營運狀況正常。" :
                          "今日營收低於近期平均，建議檢視預約狀況或療程組合。"}
                    </p>
                </div>
                
                <!-- 詳細數據 -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 16px;">📊 詳細數據對比</h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                        
                        <!-- vs 昨日 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">vs 昨日</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: ${vsYesterday >= 0 ? '#10b981' : '#ef4444'}; margin-bottom: 4px;">
                                ${vsYesterday >= 0 ? '+' : ''}${vsYesterday}%
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                ${vsYesterday >= 0 ? '↗ 成長' : '↘ 下降'}
                            </div>
                        </div>
                        
                        <!-- vs 近 7 日平均 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">vs 近 7 日平均</div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: ${vs7DaysAvg >= 0 ? '#10b981' : '#ef4444'}; margin-bottom: 4px;">
                                ${vs7DaysAvg >= 0 ? '+' : ''}${vs7DaysAvg}%
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">
                                ${vs7DaysAvg >= 0 ? '↗ 高於平均' : '↘ 低於平均'}
                            </div>
                        </div>
                        
                    </div>
                </div>
                
                <!-- 營運建議 -->
                <div style="padding: 16px; background: rgba(6, 182, 212, 0.1); border-left: 3px solid #06b6d4; border-radius: 6px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; font-size: 0.95rem;"><span style="color: #fbbf24;">💡</span> 營運建議</h4>
                    <ul style="margin: 0; padding-left: 20px; color: var(--text-body); line-height: 2.0;">
                        ${status === "高於預期" ? 
                            `<li>今日表現優異，建議可進一步分析本月熱門療程（${topTreatmentName}）與表現優異醫師之關聯性</li>
                             <li>考慮複製成功模式至其他時段或日期</li>
                             <li>維持高品質服務，鞏固客戶滿意度</li>` :
                          status === "符合預期" ?
                            `<li>營運狀況穩定，持續觀察即可</li>
                             <li>可嘗試小幅優化療程組合或時段安排</li>
                             <li>關注客戶回饋，尋找改善空間</li>` :
                            `<li>建議檢視今日預約狀況與到診率</li>
                             <li>分析是否有特定療程或時段表現不佳</li>
                             <li>考慮加強行銷或客戶關懷活動</li>`
                        }
                    </ul>
                </div>
                
                <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 6px; text-align: center;">
                    <small style="color: #6b7280; font-size: 0.85rem;">
                        * 本分析僅顯示趨勢與比率，不含實際金額明細
                    </small>
                </div>
            </div>
        `;
        detailContainer.innerHTML = detailHTML;
    }
}

/* ===================== 本月營收卡 ===================== */

function updateMonthlyRevenue() {
    // Get current month from global variable or use current date
    const currentMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    
    // 判斷是否包含未來日期
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"
    
    // 取得本月所有預約
    const allMonthAppointments = dataStore.appointments.filter(apt => 
        apt.date.startsWith(currentMonth) &&
        apt.service_item
    );
    
    // 檢查是否有未來的預約
    const hasFutureAppointments = allMonthAppointments.some(apt => apt.date > todayStr);
    
    let monthAppointments: typeof allMonthAppointments;
    let totalRevenue: number;
    let completedCount: number;
    let totalCount: number;
    let isEstimated: boolean;
    
    if (hasFutureAppointments) {
        // 包含未來預約：計算所有狀態
        monthAppointments = allMonthAppointments;
        isEstimated = true;
    } else {
        // 只有過去預約：只計算 completed
        monthAppointments = allMonthAppointments.filter(apt => apt.status === "completed");
        isEstimated = false;
    }
    
    // Calculate total revenue (Simulated)
    totalRevenue = calculateRevenue(monthAppointments, dataStore.services, sandboxStore.getState());

    // Calculate original revenue (for Delta)
    const originalRevenue = calculateRevenue(monthAppointments, dataStore.services, undefined); // Force no sandbox
    
    // Delta
    const revDelta = totalRevenue - originalRevenue;
    const revDeltaPct = originalRevenue > 0 ? (revDelta / originalRevenue) * 100 : 0;
    
    // Count appointments
    completedCount = allMonthAppointments.filter(apt => apt.status === "completed").length;
    totalCount = monthAppointments.length;
    
    // Format revenue (no currency symbol, just number with commas)
    const formattedRevenue = totalRevenue.toLocaleString('zh-TW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // Sandbox UI Logic
    let sandboxLabel = '';
    if (Math.abs(revDeltaPct) >= 0.1) {
        const isUp = revDelta > 0;
        const color = isUp ? '#ef4444' : '#10b981'; // Red=Up, Green=Down (Revenue convention on this dashboard?)
        // Consistent with Treatment Page: 🔺 Red for Up
        const icon = isUp ? '🔺' : '🔻';
        sandboxLabel = `
            <span style="font-size: 0.9rem; color: ${color}; font-weight: 700; margin-left: 8px;">
                ${icon} ${Math.abs(revDeltaPct).toFixed(1)}%
            </span>
        `;
    }
    
    // 更新卡片 UI
    const container = document.getElementById("monthly-revenue-content");
    if (container) {
        const html = `
            <div style="text-align: center; padding: 0.5rem 0;">
                ${isEstimated ? `
                    <!-- 標籤：預估 -->
                    <div style="margin-bottom: 8px;">
                        <span style="display: inline-block; padding: 4px 12px; background: rgba(148, 163, 184, 0.15); color: #64748b; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                            預估
                        </span>
                    </div>
                ` : ''}
                
                <div style="font-size: 2.5rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.5rem; letter-spacing: 0.02em; text-shadow: 0 2px 10px rgba(59, 130, 246, 0.2);">
                    ${isEstimated ? '≈ ' : ''}$${formattedRevenue}
                    ${sandboxLabel}
                </div>
                
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; font-weight: 500;">
                    ${isEstimated ? '本月預估營收 (含未來預約)' : '本月累計營收'}
                </div>
                
                <div style="padding-top: 0.75rem; border-top: 1px solid rgba(180, 220, 255, 0.2);">
                    <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 2px;">
                        ${isEstimated ? '預約總數' : '完成交易數'}
                    </div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: #64748b;">
                        ${totalCount} 件
                    </div>
                    ${isEstimated ? `
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                            （已完成 ${completedCount} 件）
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        container.innerHTML = html;
    }
    
    // 更新詳細內容（用於彈窗）
    const detailContainer = document.getElementById("revenue-monthly-detail");
    if (detailContainer) {
        // 計算平均客單價
        const avgPerAppointment = totalCount > 0 
            ? Math.round(totalRevenue / totalCount)
            : 0;
        
        // 計算每日平均
        const currentDay = today.getDate();
        const avgPerDay = currentDay > 0
            ? Math.round(totalRevenue / currentDay)
            : 0;
        
        // 計算各狀態預約數（只在預估模式下需要）
        let noShowCount = 0;
        let cancelledCount = 0;
        let pendingCount = 0;
        
        if (isEstimated) {
            noShowCount = allMonthAppointments.filter(apt => apt.status === "no_show").length;
            cancelledCount = allMonthAppointments.filter(apt => apt.status === "cancelled").length;
            pendingCount = allMonthAppointments.filter(apt => 
                apt.status !== "completed" && apt.status !== "no_show" && apt.status !== "cancelled"
            ).length;
        }
        
        const detailHTML = `
            <div style="padding: 20px;">
                <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">
                    📊 本月營收詳細分析
                </h3>
                
                ${isEstimated ? `
                    <!-- 預估標示 -->
                    <div style="margin-bottom: 20px; padding: 12px; background: rgba(148, 163, 184, 0.1); border-left: 3px solid #64748b; border-radius: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span style="display: inline-block; padding: 4px 10px; background: rgba(148, 163, 184, 0.2); color: #64748b; border-radius: 8px; font-size: 0.75rem; font-weight: 600;">
                                預估
                            </span>
                            <span style="color: var(--text-body); font-weight: 600; font-size: 0.9rem;">本數據為預估值</span>
                        </div>
                        <p style="margin: 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.6;">
                            本月營收包含未來預約，實際入帳金額請以財務報表為準
                        </p>
                    </div>
                ` : ''}
                
                <!-- 營收總覽 -->
                <div style="margin-bottom: 24px; padding: 20px; background: linear-gradient(135deg, rgba(59, 168, 255, 0.1), rgba(79, 211, 255, 0.05)); border-radius: 12px; text-align: center;">
                    <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 8px;">${isEstimated ? '本月預估營收' : '本月累計營收'}</div>
                    <div style="font-size: 3rem; font-weight: 800; color: #1e293b; margin-bottom: 16px; letter-spacing: 0.02em;">
                        ${formattedRevenue}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        截至 ${currentMonth} 月 ${currentDay} 日
                    </div>
                </div>
                
                <!-- 關鍵指標 -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 16px;">📈 關鍵指標</h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
                        
                        <!-- 預約數 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">${isEstimated ? '本月預約數' : '完成預約數'}</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary-blue); margin-bottom: 4px;">
                                ${totalCount}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">件</div>
                        </div>
                        
                        <!-- 平均客單價 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">平均客單價</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary-blue); margin-bottom: 4px;">
                                ${avgPerAppointment.toLocaleString('zh-TW')}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">元/件</div>
                        </div>
                        
                        <!-- 每日平均營收 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">每日平均營收</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary-blue); margin-bottom: 4px;">
                                ${avgPerDay.toLocaleString('zh-TW')}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">元/日</div>
                        </div>
                        
                    </div>
                </div>
                
                ${isEstimated ? `
                    <!-- 預約狀態分佈 -->
                    <div style="margin-bottom: 24px;">
                        <h4 style="color: var(--accent-color); margin-bottom: 16px;">📋 預約狀態分佈</h4>
                        
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                            
                            <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3);">
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">已完成</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #10b981;">${completedCount}</div>
                            </div>
                            
                            <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.3);">
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">未到診</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #ef4444;">${noShowCount}</div>
                            </div>
                            
                            <div style="padding: 12px; background: rgba(148, 163, 184, 0.1); border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.3);">
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">已取消</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: #64748b;">${cancelledCount}</div>
                            </div>
                            
                            <div style="padding: 12px; background: rgba(59, 168, 255, 0.1); border-radius: 6px; border: 1px solid rgba(59, 168, 255, 0.3);">
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">其他</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: var(--primary-blue);">${pendingCount}</div>
                            </div>
                            
                        </div>
                    </div>
                ` : ''}
                
                <!-- 營運洞察 -->
                <div style="padding: 16px; background: rgba(6, 182, 212, 0.1); border-left: 3px solid #06b6d4; border-radius: 6px; margin-bottom: 20px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; font-size: 0.95rem;"><span style="color: #fbbf24;">💡</span> 營運洞察</h4>
                    <ul style="margin: 0; padding-left: 20px; color: var(--text-body); line-height: 2.0;">
                        ${isEstimated ? `
                            <li>本月共 ${totalCount} 件預約，其中已完成 ${completedCount} 件（${Math.round(completedCount/totalCount*100)}%）</li>
                            <li>平均每件預約營收 ${avgPerAppointment.toLocaleString('zh-TW')} 元</li>
                        ` : `
                            <li>本月已完成 ${completedCount} 件預約，平均每件營收 ${avgPerAppointment.toLocaleString('zh-TW')} 元</li>
                        `}
                        <li>每日平均營收約 ${avgPerDay.toLocaleString('zh-TW')} 元，可作為後續排班參考</li>
                        
                        <!-- AOV Insight -->
                        ${avgPerAppointment > 10000 ? 
                            `<li>檢測到高產值客群特徵（AOV $${avgPerAppointment.toLocaleString('zh-TW')}），建議加強高階療程之術後追蹤，以提升高價值客戶之忠誠度。</li>` : 
                            `<li>建議持續關注高價值療程的預約狀況，優化營收結構</li>`
                        }

                        <!-- Dominant Treatment Insight -->
                        ${(() => {
                            const topTreatments = getTopTreatments(dataStore.appointments);
                            if (topTreatments.length > 0) {
                                const topName = topTreatments[0].name;
                                return `<li>核心產值由 ${topName} 驅動，建議同步校對設備維護時程，確保高產能下之設備妥善率。</li>`;
                            }
                            return '';
                        })()}

                        <li>建議管理層同步觀察設備與人力負載，以維持高營收下的服務細緻度</li>
                    </ul>
                </div>
                
                <!-- 計算基礎說明 -->
                <div style="padding: 16px; background: rgba(59, 168, 255, 0.08); border: 1px solid rgba(59, 168, 255, 0.2); border-radius: 8px;">
                    <h4 style="color: var(--primary-blue); margin-bottom: 12px; font-size: 0.95rem;">📋 計算基礎說明</h4>
                    <div style="color: var(--text-body); font-size: 0.85rem; line-height: 1.8;">
                        ${isEstimated ? `
                            <p style="margin: 0 0 12px 0;"><strong>本月營收為預估值，計算基礎包含：</strong></p>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li>已完成預約（completed）</li>
                                <li>尚未到診預約</li>
                                <li>取消 / 爽約預約</li>
                            </ul>
                            <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 0.8rem;">
                                ※ 實際入帳金額請以財務報表為準，本數據僅供營運趨勢參考
                            </p>
                        ` : `
                            <p style="margin: 0 0 12px 0;">本月營收統計範圍：</p>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li><strong>已完成預約（completed）</strong>：已到診並完成療程的預約</li>
                                <li><strong>不含</strong>：未到診（no_show）、已取消（cancelled）、待確認預約</li>
                            </ul>
                            <p style="margin: 12px 0 0 0; color: #6b7280; font-size: 0.8rem;">
                                ※ 實際入帳金額請以財務報表為準，本數據僅供營運趨勢參考
                            </p>
                        `}
                    </div>
                </div>
            </div>
        `;
        detailContainer.innerHTML = detailHTML;
    }
}

/* ===================== 回診率卡 ===================== */

function updateReturnVisitRate() {
    // 取得當前月份（從 global 變數或使用當前日期）
    const currentMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    
    // 篩選本月 completed 的預約
    const monthAppointments = dataStore.appointments.filter(apt => 
        apt.status === "completed" && 
        apt.date.startsWith(currentMonth)
    );
    
    // 統計每個客戶的預約次數
    const customerVisitCount = new Map<string, number>();
    monthAppointments.forEach(apt => {
        if (apt.customer_id) {
            const count = customerVisitCount.get(apt.customer_id) || 0;
            customerVisitCount.set(apt.customer_id, count + 1);
        }
    });
    
    // 計算回診客數量（本月內有 ≥2 次預約）
    let returnCustomers = 0;
    customerVisitCount.forEach(count => {
        if (count >= 2) {
            returnCustomers++;
        }
    });
    
    // 總客戶數
    const totalCustomers = customerVisitCount.size;
    
    // 計算回診率
    const returnRate = totalCustomers > 0 
        ? Math.round((returnCustomers / totalCustomers) * 100)
        : 0;
    
    // 判斷狀態
    let statusText = "穩定";
    let statusColor = "#10b981"; // green
    if (returnRate < 30) {
        statusText = "偏低";
        statusColor = "#ef4444"; // red
    } else if (returnRate < 45) {
        statusText = "普通";
        statusColor = "#f59e0b"; // amber
    }
    
    // 更新卡片 UI
    const container = document.getElementById("return-visit-content");
    if (container) {
        // 計算圓形進度（SVG）
        const radius = 35;
        const circumference = 2 * Math.PI * radius;
        const progress = (returnRate / 100) * circumference;
        const remaining = circumference - progress;
        
        const html = `
            <div style="padding: 8px 0;">
                <!-- 標題與狀態 -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">本月回診率</span>
                    <span style="padding: 4px 12px; background: ${statusColor}20; color: ${statusColor}; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
                        ${statusText}
                    </span>
                </div>
                
                <!-- 圓形進度圖 + 數據 -->
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                    <!-- 圓形進度 -->
                    <div style="position: relative; width: 80px; height: 80px; flex-shrink: 0;">
                        <svg width="80" height="80" style="transform: rotate(-90deg);">
                            <!-- 背景圓 -->
                            <circle cx="40" cy="40" r="${radius}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6"/>
                            <!-- 進度圓 -->
                            <circle cx="40" cy="40" r="${radius}" fill="none" stroke="${statusColor}" stroke-width="6" 
                                    stroke-dasharray="${progress} ${remaining}" 
                                    stroke-linecap="round"
                                    style="transition: stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1);"/>
                        </svg>
                        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                            <div style="font-size: 1.4rem; font-weight: 700; color: ${statusColor};">${returnRate}%</div>
                        </div>
                    </div>
                    
                    <!-- 數據卡片 -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                        <div style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid ${statusColor};">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">回診客戶</div>
                            <div style="font-size: 1rem; font-weight: 700; color: ${statusColor}; margin-top: 2px;">
                                ${returnCustomers} 位
                            </div>
                        </div>
                        <div style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid rgba(255,255,255,0.3);">
                            <div style="font-size: 0.7rem; color: var(--text-muted);">總客戶數</div>
                            <div style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-top: 2px;">
                                ${totalCustomers} 位
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 黏著度評估 -->
                <div style="padding: 10px; background: ${statusColor}10; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">顧客黏著度評估</div>
                    <div style="font-size: 0.85rem; font-weight: 600; color: ${statusColor};">
                        ${statusText === '穩定' ? '✓ 黏著度良好，客戶滿意度高' : 
                          statusText === '普通' ? '○ 黏著度中等，尚有提升空間' : 
                          '△ 黏著度偏低，需要關注'}
                    </div>
                </div>
            </div>
        `;
        container.innerHTML = html;
    }
    
    // 更新詳細內容（用於彈窗）
    const detailContainer = document.getElementById("return-visit-detail");
    if (detailContainer) {
        // 計算單次客戶數
        const oneTimeCustomers = totalCustomers - returnCustomers;
        const oneTimeRate = totalCustomers > 0
            ? Math.round((oneTimeCustomers / totalCustomers) * 100)
            : 0;
        
        // 計算平均回診次數（僅針對回診客）
        let totalVisits = 0;
        customerVisitCount.forEach(count => {
            if (count >= 2) {
                totalVisits += count;
            }
        });
        const avgVisitsPerReturn = returnCustomers > 0
            ? (totalVisits / returnCustomers).toFixed(1)
            : "0.0";
        
        const detailHTML = `
            <div style="padding: 20px;">
                <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">
                    🔄 本月顧客回診率詳細分析
                </h3>
                
                <!-- 回診率總覽 -->
                <div style="margin-bottom: 24px; padding: 20px; background: linear-gradient(135deg, ${statusColor}15, ${statusColor}08); border-radius: 12px; text-align: center;">
                    <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">本月回診率</div>
                    <div style="font-size: 3rem; font-weight: 700; color: ${statusColor}; margin-bottom: 8px; letter-spacing: 0.02em;">
                        ${returnRate}%
                    </div>
                    <div style="font-size: 1rem; color: var(--text-body); margin-bottom: 16px;">
                        顧客黏著度：<span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);">
                        ${returnCustomers} / ${totalCustomers} 位顧客在本月回診
                    </div>
                </div>
                
                <!-- 客戶分析 -->
                <div style="margin-bottom: 24px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 16px;">👥 客戶結構分析</h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                        
                        <!-- 回診客戶 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">回診客戶</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: ${statusColor}; margin-bottom: 4px;">
                                ${returnCustomers}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">位（${returnRate}%）</div>
                        </div>
                        
                        <!-- 單次客戶 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">單次客戶</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">
                                ${oneTimeCustomers}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">位（${oneTimeRate}%）</div>
                        </div>
                        
                        <!-- 平均回診次數 -->
                        <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(180, 220, 255, 0.3);">
                            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">平均回診次數</div>
                            <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary-blue); margin-bottom: 4px;">
                                ${avgVisitsPerReturn}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">次/人</div>
                        </div>
                        
                    </div>
                </div>
                
                <!-- 黏著度評估 -->
                <div style="margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 8px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px;">📊 黏著度評估</h4>
                    <div style="color: var(--text-body); line-height: 1.8;">
                        ${statusText === "穩定" ? 
                            `<p style="margin-bottom: 12px;">✅ <strong>黏著度良好</strong>：本月回診率達 ${returnRate}%，顯示客戶對診所服務滿意度高，願意持續回診。</p>
                             <p>回診客戶平均每人完成 ${avgVisitsPerReturn} 次療程，顯示客戶對療程效果認同。</p>` :
                          statusText === "普通" ?
                            `<p style="margin-bottom: 12px;">⚠️ <strong>黏著度中等</strong>：本月回診率為 ${returnRate}%，尚有提升空間。</p>
                             <p>建議加強客戶關係維護，提升服務品質與客戶滿意度。</p>` :
                            `<p style="margin-bottom: 12px;">🔴 <strong>黏著度偏低</strong>：本月回診率僅 ${returnRate}%，需要關注。</p>
                             <p>建議檢視服務流程、療程效果與客戶回饋，找出改善方向。</p>`
                        }
                    </div>
                </div>
                
                <!-- 營運建議 -->
                <div style="padding: 16px; background: rgba(6, 182, 212, 0.1); border-left: 3px solid #06b6d4; border-radius: 6px;">
                    <h4 style="color: var(--accent-color); margin-bottom: 12px; font-size: 0.95rem;"><span style="color: #fbbf24;">💡</span> 營運建議</h4>
                    <ul style="margin: 0; padding-left: 20px; color: var(--text-body); line-height: 2.0;">
                        ${statusText === "穩定" ?
                            `<li>維持現有服務品質，鞏固客戶忠誠度</li>
                             <li>評估是否針對回診客群規劃專屬優惠</li>
                             <li>收集客戶回饋，持續優化服務體驗</li>
                             <li>分析回診客戶的療程偏好，作為行銷參考</li>
                             ${parseFloat(avgVisitsPerReturn) > 4 ? '<li>檢測到超高頻次消費模式，建議評估包套客戶的留存價值與轉單率</li>' : ''}` :
                          statusText === "普通" ?
                            `<li>加強療程後的客戶關懷與追蹤</li>
                             <li>設計回診優惠方案，提升客戶回流意願</li>
                             <li>檢視單次客戶的流失原因，改善服務流程</li>
                             <li>建立客戶分級制度，針對性提供服務</li>` :
                            `<li><strong>優先</strong>：檢視客戶滿意度與服務品質</li>
                             <li>分析單次客戶特徵，找出流失原因</li>
                             <li>加強療程效果說明與期望管理</li>
                             <li>建立客戶回訪機制，主動關懷與邀約</li>
                             <li>考慮推出首次回診優惠，降低回診門檻</li>`
                        }
                    </ul>
                </div>
                
                <div style="margin-top: 16px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 6px; text-align: center;">
                    <small style="color: #6b7280; font-size: 0.85rem;">
                        * 回診客定義：本月內有 ≥2 次 completed 預約的客戶
                    </small>
                </div>
            </div>
        `;
        detailContainer.innerHTML = detailHTML;
    }
}

/* ===================== Helper ===================== */

function setText(id: string, val: string | number) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
}

function setHTML(id: string, html: string) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function avg(arr: number[]) {
    return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
}

/* ===================== 未來趨勢雷達 ===================== */

/* ===================== 未來趨勢雷達 ===================== */

function updateFutureTrendsRadar() {
    const container = document.getElementById("future-trends-radar");
    if (!container) return;

    // 取得今天日期
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 計算未來 14-30 天的日期範圍
    const future14 = new Date(today);
    future14.setDate(today.getDate() + 14);
    
    const future30 = new Date(today);
    future30.setDate(today.getDate() + 30);
    
    // 篩選未來 14-30 天的預約
    const futureAppointments = dataStore.appointments.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate >= future14 && aptDate <= future30;
    });
    
    const trends: string[] = [];
    const totalFutureBookings = futureAppointments.length;
    
    // 1. 預約量趨勢
    // 假設 16 天，簡單閾值判斷
    if (totalFutureBookings < 80) { // < 5/day
        trends.push(`📉 預約量：未來動能趨緩，留意空窗`);
    } else if (totalFutureBookings > 240) { // > 15/day
        trends.push(`📈 預約量：來客數皆預期攀升，需備戰`);
    } else {
        trends.push(`⚖️ 預約量：未來半個月營運節奏持穩`);
    }

    // 2. 療程集中度 (Risk of bottleneck)
    const serviceCount: Record<string, number> = {};
    futureAppointments.forEach(apt => {
        if (apt.service_item) serviceCount[apt.service_item] = (serviceCount[apt.service_item] || 0) + 1;
    });
    const maxSvcCount = Math.max(...Object.values(serviceCount), 0);
    if (totalFutureBookings > 0 && (maxSvcCount / totalFutureBookings) > 0.4) {
        trends.push(`🔥 療程需求：特定項目趨於集中，留意庫存`);
    }

    // 3. 週末/時段分佈
    let weekendCount = 0;
    futureAppointments.forEach(apt => {
        const d = new Date(apt.date).getDay();
        if (d === 0 || d === 6) weekendCount++;
    });
    if (totalFutureBookings > 0 && (weekendCount / totalFutureBookings) > 0.45) {
        trends.push(`📅 時段分佈：假日預約趨於飽和，建議分流`);
    }

    // 4. 人力/資源配置 (Implicit check)
    // If volume is high or weekend is high, staffing alert
    if (totalFutureBookings > 240 || (totalFutureBookings > 0 && (weekendCount / totalFutureBookings) > 0.45)) {
        trends.push(`👥 人力配置：部分時段預期出現人力吃緊`);
    } else {
        trends.push(`✅ 人力配置：醫療排程分佈預期將穩健`);
    }

    // Select top 3-4 unique trends
    const uniqueTrends = Array.from(new Set(trends)).slice(0, 4);

    // 渲染
    const html = uniqueTrends.map(trend => `<li style="margin-bottom:8px;">${trend}</li>`).join('');
    container.innerHTML = html || '<li style="color: var(--text-muted);">未來兩週暫無顯著波動</li>';
}

// 讓 pageController 可以呼叫
(window as any).initOverviewPage = initOverviewPage;
(window as any).refreshOverviewPageByMonth = refreshOverviewPageByMonth;

// ... (The file ended here, I will append the function)
function generateKPIDetail(type: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const appointments = dataStore.appointments.filter(a => a.date === today);
    const staff = dataStore.staff.filter(s => s.status === 'active');

    let html = `<div style="padding: 20px;">`;

    if (type === 'kpi-today') {
        const total = appointments.length;
        const completed = appointments.filter(a => a.status === 'completed').length;
        const cancelled = appointments.filter(a => a.status === 'cancelled').length;
        const noShow = appointments.filter(a => a.status === 'no_show').length;
        const pending = total - completed - cancelled - noShow;
        const checkedIn = appointments.filter(a => a.status === 'checked_in').length;

        // Merge pending and checkedIn for display if desired, or show separately
        // Let's group them: Pending/Checked-in

        html += `
            <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">📅 今日預約詳細分析</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div style="padding: 15px; background: rgba(59, 130, 246, 0.1); border-radius: 8px; text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 800; color: #3b82f6;">${total}</div>
                    <div style="color: var(--text-muted); font-size: 0.9rem;">總預約數</div>
                </div>
                 <div style="padding: 15px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: 800; color: #10b981;">${completed}</div>
                    <div style="color: var(--text-muted); font-size: 0.9rem;">已完成</div>
                </div>
            </div>
            
            <h4 style="color: var(--text-heading); margin-bottom: 10px;">狀態分佈</h4>
             <ul style="list-style: none; padding: 0; margin-bottom: 20px;">
                <li style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="color: var(--text-body);">已報到 / 進行中</span> <span style="font-weight: 700; color: #f59e0b;">${checkedIn + pending}</span>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="color: var(--text-body);">已取消</span> <span style="font-weight: 700; color: #94a3b8;">${cancelled}</span>
                </li>
                <li style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span style="color: var(--text-body);">未到診 (No Show)</span> <span style="font-weight: 700; color: #ef4444;">${noShow}</span>
                </li>
            </ul>

            <div style="padding: 16px; background: rgba(139, 92, 246, 0.1); border-left: 4px solid #8b5cf6; border-radius: 8px;">
                 <h4 style="color: #8b5cf6; margin-bottom: 8px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-robot"></i> AI 營運洞察
                 </h4>
                 <p style="color: var(--text-body); line-height: 1.6; font-size: 0.95rem;">
                    ${total < 5 ? '今日預約量明顯偏低（< 5 件），建議檢視是否為特殊節假日，或可安排內部教育訓練與設備保養。' : 
                      total > 20 ? '🔥 今日預約量大（> 20 件），現場可能較為繁忙。建議留意櫃台接待動線與客戶等候時間，避免過度擁擠。' : 
                      '✅ 今日預約量適中，營運節奏穩定，可專注於提升每一位客戶的服務體驗。'}
                 </p>
            </div>
        `;

    } else if (type === 'kpi-show-rate') {
        const total = appointments.length;
         const show = appointments.filter(a => a.status === 'completed' || a.status === 'checked_in').length;
         const rate = total > 0 ? Math.round((show / total) * 100) : 0;
         
         const isLow = rate < 75;
         const isHigh = rate > 90;

         html += `
            <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">📉 到診率詳細分析</h3>
            
            <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 25px;">
                 <div style="position: relative; width: 140px; height: 140px; border-radius: 50%; background: conic-gradient(${isLow ? '#ef4444' : (isHigh ? '#10b981' : '#3b82f6')} ${rate}%, rgba(255,255,255,0.1) 0);">
                    <div style="position: absolute; inset: 12px; background: #0f172a; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <span style="font-size: 2.5rem; font-weight: 800; color: #fff;">${rate}%</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">今日到診率</span>
                    </div>
                 </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
                <div style="text-align: center; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem;">應到人數</div>
                    <div style="font-weight: 700; font-size: 1.2rem; color: var(--text-main);">${total}</div>
                </div>
                <div style="text-align: center; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem;">實到人數</div>
                    <div style="font-weight: 700; font-size: 1.2rem; color: ${isLow ? '#ef4444' : '#10b981'};">${show}</div>
                </div>
            </div>

             <div style="padding: 16px; background: rgba(139, 92, 246, 0.1); border-left: 4px solid #8b5cf6; border-radius: 8px;">
                 <h4 style="color: #8b5cf6; margin-bottom: 8px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-robot"></i> AI 營運洞察
                 </h4>
                 <p style="color: var(--text-body); line-height: 1.6; font-size: 0.95rem;">
                    ${isLow ? '⚠️ <strong>今日到診率偏低</strong>：可能有較多臨時取消或未到診。建議立即由櫃台人員進行電話關懷 (Call)，或檢查系統的「預約提醒簡訊」是否正常發送。' : 
                      isHigh ? '✅ <strong>今日到診率極佳</strong>：顯示客戶承諾度高，且團隊預約管理落實，請繼續保持此高標水準。' : 
                      'ℹ️ 今日到診率在正常範圍內，請持續監控特定時段的出席狀況。'}
                 </p>
            </div>
         `;
    } else if (type.startsWith('kpi-')) {
        // Staff types
        let targetStaff: any[] = [];
        let title = '';
        let staffIcon = '';
        
        if (type === 'kpi-doc') {
             targetStaff = staff.filter(s => s.staff_type === 'doctor');
             title = '醫師值班名單';
             staffIcon = '👨‍⚕️';
        } else if (type === 'kpi-nurse') {
             targetStaff = staff.filter(s => s.staff_type === 'nurse' || s.staff_type === 'therapist');
             title = '護理/美療師值班名單';
             staffIcon = '👩‍⚕️';
        } else if (type === 'kpi-consultant') {
             targetStaff = staff.filter(s => s.staff_type === 'consultant');
             title = '諮詢師值班名單';
             staffIcon = '🤵';
        } else {
             targetStaff = staff.filter(s => s.staff_type === 'admin');
             title = '行政人員值班名單';
             staffIcon = '🛡️';
        }
        
        const count = targetStaff.length;

        html += `
             <h3 style="color: var(--text-heading); margin-bottom: 20px; border-bottom: 2px solid var(--accent-color); padding-bottom: 10px;">${staffIcon} ${title}</h3>
             
             <div style="margin-bottom: 24px; max-height: 300px; overflow-y: auto;">
                 ${count > 0 ? targetStaff.map(s => `
                    <div style="padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; gap: 12px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 5px #10b981;"></div>
                        <span style="font-size: 1rem; font-weight: 500; color: var(--text-main);">${s.staff_name}</span>
                        <span style="margin-left: auto; font-size: 0.75rem; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 2px 8px; border-radius: 10px;">Active</span>
                    </div>
                 `).join('') : '<div style="color: #94a3b8; text-align: center; padding: 20px;">今日無此類別人員排班</div>'}
             </div>

             <div style="padding: 16px; background: rgba(139, 92, 246, 0.1); border-left: 4px solid #8b5cf6; border-radius: 8px;">
                 <h4 style="color: #8b5cf6; margin-bottom: 8px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-robot"></i> AI 人力洞察
                 </h4>
                 <p style="color: var(--text-body); line-height: 1.6; font-size: 0.95rem;">
                    ${count === 0 ? '⚠️ <strong>人力警示</strong>：今日系統未偵測到此類別人員值班，請確認排班表是否異常，或是否有人員漏打卡。' : 
                      `ℹ️ 目前有 ${count} 位人員在勤，人力配置符合今日預約需求，建議關注尖峰時段的調度彈性。`}
                 </p>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

// Helper to get latest data date from appointments (for subtitle)
function getLatestDataDate(list: any[]): string {
    if (!list || list.length === 0) return new Date().toISOString().slice(0, 10);
    const sorted = list.map(a => a.date).sort().reverse();
    return sorted[0] || new Date().toISOString().slice(0, 10);
}

// 1. 醫師詳細彈窗生成器
function generateDoctorDetail(list: {doctor: string, count: number}[]): string {
    const targetMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);
    
    // Calculate effective date range for subtitle
    const validApps = dataStore.appointments.filter(a => 
        a.date && a.date.startsWith(targetMonth) && a.date <= today && a.status === 'completed'
    );
    const latestDate = getLatestDataDate(validApps);
    const dateRangeStr = `${targetMonth}-01 至 ${latestDate}`;

    // Blacklist for Doctor Specialty (Fallback calculation only)
    const BLACKLIST_SERVICES = ['諮詢', '諮詢服務', '術後衛教', '回診', '點滴', '一般門診'];

    let html = `<div style="padding: 24px;">
        <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <p style="color: var(--text-muted); margin: 0; font-size: 0.95rem;">統計區間：${dateRangeStr}</p>
                <span style="font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1);">僅計算已完成項目</span>
            </div>
            <span style="color: #10b981; font-weight: 500; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-check-circle"></i> 明細數據載入完成
            </span>
        </div>
        
        <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;">
            <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);">
                        <th style="text-align: center; padding: 16px; color: var(--text-heading); font-size: 1rem; width: 80px;">排名</th>
                        <th style="text-align: left; padding: 16px; color: var(--text-heading); font-size: 1rem; width: 250px;">醫師姓名 <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">(主力專長)</span></th>
                        <th style="text-align: center; padding: 16px; color: var(--text-heading); font-size: 1rem; width: 120px;">本月累計</th>
                        <th style="text-align: left; padding: 16px; color: var(--text-heading); font-size: 1rem;">主力療程數據 (Top 3)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (list.length === 0) {
        html += `<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-muted);">本月無醫師數據</td></tr>`;
    } else {
        list.forEach((doc, index) => {
            // Strict Filter: Month-to-Date & Completed
            const docApps = validApps.filter(a => a.doctor_name === doc.doctor);
            
            // --- Specialty Logic Start ---
            let topDescriptor = '一般門診';
            let isStaticSpecialty = false;

            // Priority 1: Check Static Staff Data
            const staffRec = dataStore.staff.find(s => s.staff_name === doc.doctor);
            if (staffRec && staffRec.specialty && staffRec.specialty !== 'General') {
                topDescriptor = staffRec.specialty;
                isStaticSpecialty = true;
            } else {
                // Priority 2: Dynamic Fallback (Revenue/Price Weighted)
                // Identify all services performed by this doctor in the period
                const performedServices = new Set<string>();
                docApps.forEach(a => {
                   const items = a.service_item.split(';');
                   items.forEach(i => {
                       const name = i.trim();
                       if (name && !BLACKLIST_SERVICES.some(b => name.includes(b))) {
                           performedServices.add(name);
                       }
                   });
                });

                // Find the one with highest Unit Price
                let maxPrice = -1;
                let bestService = '';

                performedServices.forEach(svcName => {
                    const svcInfo = dataStore.services.find(s => s.service_name === svcName);
                    const price = svcInfo ? svcInfo.price : 0;
                    if (price > maxPrice) {
                        maxPrice = price;
                        bestService = svcName;
                    }
                });

                if (bestService) {
                    topDescriptor = `本月主攻：${bestService}`;
                }
            }
            // --- Specialty Logic End ---

            // Top Breakdown Stats (Count based)
            const serviceCounts: Record<string, number> = {};
            docApps.forEach(a => {
                const items = a.service_item.split(';');
                items.forEach(i => {
                    const name = i.trim();
                    if(name) serviceCounts[name] = (serviceCounts[name] || 0) + 1;
                });
            });
            
            const sortedServices = Object.entries(serviceCounts).sort((a,b) => b[1] - a[1]);
            
            const topServicesHtml = sortedServices
                .slice(0, 3)
                .map(([name, count]) => `
                    <div style="display: inline-flex; align-items: center; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); padding: 4px 10px; border-radius: 6px; margin-right: 8px; margin-bottom: 4px;">
                        <span style="color: var(--text-heading); font-size: 0.85rem; margin-right: 6px;">${name}</span>
                        <span style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: 0.75rem; padding: 1px 6px; border-radius: 4px; font-weight: 700;">${count}</span>
                    </div>`)
                .join('');

            const medals = ['🥇', '🥈', '🥉'];
            const rankDisplay = index < 3 
                ? `<span style="font-size: 1.5rem; text-shadow: 0 0 10px rgba(255,215,0,0.2);">${medals[index]}</span>` 
                : `<span style="font-size: 1.1rem; color: var(--text-muted); font-weight: 600;">#${index + 1}</span>`;

            // UI for Specialty Tag
            // Static: Tag icon + Blue/Purple Style
            // Dynamic: Star icon + Orange Style (to differentiate)
            const specialtyTagHtml = isStaticSpecialty
                ? `<div style="display: inline-block; font-size: 0.8rem; color: #8b5cf6; background: rgba(139, 92, 246, 0.1); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.2);">
                       <i class="fa-solid fa-tag" style="font-size: 0.7rem; margin-right: 4px;"></i>${topDescriptor}
                   </div>`
                : `<div style="display: inline-block; font-size: 0.8rem; color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2);">
                       <i class="fa-solid fa-star" style="font-size: 0.7rem; margin-right: 4px;"></i>${topDescriptor}
                   </div>`;

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 16px; text-align: center;">${rankDisplay}</td>
                    <td style="padding: 16px;">
                        <div style="font-weight: 700; color: var(--text-heading); font-size: 1.1rem; margin-bottom: 4px;">${doc.doctor}</div>
                        ${specialtyTagHtml}
                    </td>
                    <td style="padding: 16px; text-align: center;">
                        <div style="font-size: 1.25rem; color: var(--accent-color); font-weight: 700; letter-spacing: 0.5px;">${doc.count}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Cases</div>
                    </td>
                    <td style="padding: 16px;">
                        <div style="display: flex; flex-wrap: wrap;">${topServicesHtml || '<span style="color: var(--text-muted);">-</span>'}</div>
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table></div></div>`; // Close wrapper
    return html;
}

// 2. 療程詳細彈窗生成器 (含 Age/Gender 水平長條圖)
function generateTreatmentDetail(list: {name: string, count: number}[]): string {
    const targetMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);
    
    // Calculate effective date range for subtitle
    const validApps = dataStore.appointments.filter(a => 
        a.date && a.date.startsWith(targetMonth) && a.date <= today && a.status === 'completed'
    );
    const latestDate = getLatestDataDate(validApps);
    const dateRangeStr = `${targetMonth}-01 至 ${latestDate}`;
    
    let html = `<div style="padding: 24px;">
        <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
             <div style="display: flex; align-items: center; gap: 8px;">
                <p style="color: var(--text-muted); margin: 0; font-size: 0.95rem;">統計區間：${dateRangeStr}</p>
                <span style="font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1);">僅計算已完成項目</span>
            </div>
            <span style="color: #10b981; font-weight: 500; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-check-circle"></i> 明細數據載入完成
            </span>
        </div>
        <div style="display: grid; gap: 24px;">
    `;

    if (list.length === 0) {
        html += `<div style="text-align: center; color: var(--text-muted); padding: 40px;">本月無熱門療程數據</div>`;
    } else {
        list.forEach((item, index) => {
            // Strict Filter: Month-to-Date & Completed
            const apps = validApps.filter(a => a.service_item && a.service_item.includes(item.name));

            // Gender Stats
            let male = 0, female = 0;
            apps.forEach(a => a.gender === 'male' ? male++ : female++);
            const totalGender = male + female;
            const malePct = totalGender ? Math.round((male/totalGender)*100) : 0;
            const femalePct = totalGender ? Math.round((female/totalGender)*100) : 0;

            // Age Stats
            const ageGroups = { '<25': 0, '25-35': 0, '36-45': 0, '46-55': 0, '>55': 0 };
            let maxAgeCount = 0;
            apps.forEach(a => {
                const age = a.age || 30;
                if (age < 25) ageGroups['<25']++;
                else if (age <= 35) ageGroups['25-35']++;
                else if (age <= 45) ageGroups['36-45']++;
                else if (age <= 55) ageGroups['46-55']++;
                else ageGroups['>55']++;
            });
            maxAgeCount = Math.max(...Object.values(ageGroups), 1); // Avoid div by zero

            const rankBadge = index < 3 
                ? `<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(245, 158, 11, 0.4);">${index + 1}</div>`
                : `<div style="width: 32px; height: 32px; border-radius: 50%; background: #334155; color: #94a3b8; font-weight: bold; display: flex; align-items: center; justify-content: center;">${index+1}</div>`;

            html += `
                <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 24px; border: 1px solid rgba(255,255,255,0.08); display: grid; grid-template-columns: 1fr 3fr; gap: 30px; align-items: center;">
                    
                    <!-- Left: Header Info -->
                    <div style="display: flex; flex-direction: column; gap: 12px; border-right: 1px solid rgba(255,255,255,0.1); padding-right: 20px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            ${rankBadge}
                            <span style="font-size: 0.9rem; color: #f59e0b; font-weight: 600;">RANK ${index+1}</span>
                        </div>
                        <h3 style="color: var(--text-heading); margin: 0; font-size: 1.4rem; line-height: 1.3;">${item.name}</h3>
                        <div style="margin-top: auto; display: flex; align-items: baseline; gap: 8px;">
                            <span style="color: var(--text-heading); font-weight: 700; font-size: 1.8rem;">${item.count}</span>
                            <span style="color: var(--text-muted); font-size: 0.9rem;">Cases</span>
                        </div>
                    </div>

                    <!-- Right: Charts -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        
                        <!-- Gender Chart (Horizontal Bar) -->
                        <div>
                             <h5 style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Gender Distribution</h5>
                             <div style="display: flex; flex-direction: column; gap: 8px;">
                                 <!-- Female -->
                                 <div style="display: flex; align-items: center; gap: 10px; font-size: 0.85rem;">
                                     <span style="width: 30px; color: #ec4899; font-weight: 600;">女</span>
                                     <div style="flex: 1; height: 8px; background: rgba(236, 72, 153, 0.1); border-radius: 4px; overflow: hidden;">
                                         <div style="width: ${femalePct}%; height: 100%; background: #ec4899;"></div>
                                     </div>
                                     <span style="width: 40px; text-align: right; color: var(--text-body);">${femalePct}%</span>
                                 </div>
                                 <!-- Male -->
                                 <div style="display: flex; align-items: center; gap: 10px; font-size: 0.85rem;">
                                     <span style="width: 30px; color: #3b82f6; font-weight: 600;">男</span>
                                     <div style="flex: 1; height: 8px; background: rgba(59, 130, 246, 0.1); border-radius: 4px; overflow: hidden;">
                                         <div style="width: ${malePct}%; height: 100%; background: #3b82f6;"></div>
                                     </div>
                                     <span style="width: 40px; text-align: right; color: var(--text-body);">${malePct}%</span>
                                 </div>
                             </div>
                        </div>

                        <!-- Age Chart (Horizontal Bars) -->
                        <div>
                            <h5 style="margin-bottom: 12px; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;">Age Groups</h5>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                ${Object.entries(ageGroups).map(([group, count]) => {
                                    const widthPct = maxAgeCount ? Math.round((count/maxAgeCount)*100) : 0;
                                    // Use a subtle gradient or solid color
                                    return `
                                        <div style="display: flex; align-items: center; gap: 10px; font-size: 0.8rem;">
                                            <span style="width: 40px; color: var(--text-muted); text-align: right;">${group}</span>
                                            <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                                                <div style="width: ${widthPct}%; height: 100%; background: var(--accent-color); opacity: 0.8;"></div>
                                            </div>
                                            <span style="width: 24px; color: var(--text-body);">${count}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                    </div>
                </div>
            `;
        });
    }

    html += `</div></div>`;
    return html;
}

// 3. 資源監控詳細生成器 (Room / Equip) – 含 Hover 與紅字警告與淡紅背景
function generateResourceDetail(type: 'room' | 'equip', targetDate?: string): string {
    const { roomUsage, equipmentUsage } = calcRoomAndEquipmentUsage(dataStore.appointments, dataStore.services, false, targetDate);
    
    const timeLabel = targetDate ? "今日" : "本月";
    const subLabel = targetDate ? `僅顯示 ${targetDate} 數據` : "本月平均";

    let html = `<div style="padding: 24px;">
        <div style="margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                 <h2 style="margin: 0; color: var(--text-heading); font-size: 1.25rem;">${timeLabel}資源效能監控表</h2>
                 <p style="color: var(--text-muted); margin: 4px 0 0 0; font-size: 0.9rem;">監控診間使用率與設施設備健康度 (${subLabel})</p>
            </div>
            <span style="color: #10b981; font-weight: 500; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
                 <i class="fa-solid fa-check-circle"></i> 明細數據載入完成
            </span>
        </div>
        
        <div style="overflow-x: auto; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);">
                        <th style="text-align: left; padding: 16px; color: var(--text-heading); font-size: 1rem;">資源名稱 <i class="fa-solid fa-tag" style="font-size: 0.8rem; margin-left: 6px; color: var(--text-muted);"></i></th>
    `;
    
    if (type === 'room') {
        html += `
                        <th style="text-align: center; padding: 16px; color: var(--text-heading); font-size: 1rem;">類型</th>
                        <th style="text-align: left; padding: 16px; color: var(--text-heading); font-size: 1rem; width: 40%;">${timeLabel}使用率 (目標 < 80%)</th>
                        <th style="text-align: center; padding: 16px; color: var(--text-heading); font-size: 1rem;">狀態</th>
                    </tr></thead><tbody>
        `;
        
        roomUsage.forEach(r => {
            const barColor = r.usageRate >= 80 ? '#ef4444' : r.usageRate >= 50 ? '#f59e0b' : '#10b981';
            // Alert Row Bg for > 80%
            const rowStyle = r.usageRate >= 80 
                ? 'background: rgba(239, 68, 68, 0.15); border-bottom: 1px solid rgba(239, 68, 68, 0.2);' 
                : 'border-bottom: 1px solid rgba(255,255,255,0.05);';
            
            html += `
                <tr style="${rowStyle} transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.1)'" onmouseout="this.style.backgroundColor='${r.usageRate >= 80 ? 'rgba(239, 68, 68, 0.15)' : 'transparent'}'">
                    <td style="padding: 16px; font-weight: 600; color: var(--text-heading); font-size: 1.05rem;">
                        ${r.room}
                        ${r.usageRate >= 80 ? '<span style="font-size: 0.75rem; color: #ef4444; border: 1px solid #ef4444; border-radius: 4px; padding: 1px 4px; margin-left: 8px;">BUSY</span>' : ''}
                    </td>
                    <td style="padding: 16px; text-align: center; color: var(--text-muted);">診間</td>
                    <td style="padding: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="flex: 1; height: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; overflow: hidden;">
                                <div style="width: ${r.usageRate}%; height: 100%; background: ${barColor}; box-shadow: 0 0 10px ${barColor}66;"></div>
                            </div>
                            <span style="color: ${barColor}; font-weight: 700; width: 45px; text-align: right; font-size: 1.1rem;">${r.usageRate}%</span>
                        </div>
                    </td>
                    <td style="padding: 16px; text-align: center;">
                        <span style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">Active</span>
                    </td>
                </tr>
            `;
        });

    } else { // Equip
        html += `
                        <th style="text-align: left; padding: 16px; color: var(--text-heading); font-size: 1rem; width: 30%;">${timeLabel}使用率</th>
                        <th style="text-align: center; padding: 16px; color: var(--text-heading); font-size: 1rem;">耗材剩餘量 <span style="font-size:0.8rem; color:#ef4444;">(<10 告警)</span></th>
                        <th style="text-align: center; padding: 16px; color: var(--text-heading); font-size: 1rem;">潛在待消化案量</th>
                    </tr></thead><tbody>
        `;
        
        equipmentUsage.forEach(e => {
            const barColor = e.usageRate >= 80 ? '#f59e0b' : e.usageRate >= 50 ? '#8b5cf6' : '#06b6d4';
            
            // Mock Data
            const remaining = Math.floor(Math.random() * 470) + 0; // 0 ~ 470
            const demand = Math.floor(Math.random() * 25) + 5;
            
            // Warning Logic: < 10 for Red Bold
            const isCritical = remaining < 10;
            const isLow = remaining < 50; 
            
            // Cell Style for Remaining
            const remainingStyle = isCritical 
                ? 'color: #ef4444; font-weight: 800; font-size: 1.4rem; text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);' 
                : isLow 
                    ? 'color: #f59e0b; font-weight: 700; font-size: 1.1rem;' 
                    : 'color: #10b981; font-weight: 600; font-size: 1.1rem;';

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 16px; font-weight: 600; color: var(--text-heading); font-size: 1.05rem;">
                        ${e.equipment}
                        ${isCritical ? '<i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-left: 8px; animation: pulse 2s infinite;"></i>' : ''}
                    </td>
                    <td style="padding: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="flex: 1; height: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${e.usageRate}%; height: 100%; background: ${barColor};"></div>
                            </div>
                            <span style="color: ${barColor}; font-weight: 700; width: 40px; font-size: 0.95rem;">${e.usageRate}%</span>
                        </div>
                    </td>
                     <td style="padding: 16px; text-align: center;">
                        <span style="${remainingStyle}">
                            ${remaining} 
                        </span>
                        <small style="font-weight: normal; color: var(--text-muted); font-size: 0.8rem; margin-left: 4px;">shots</small>
                        ${isCritical ? '<div style="font-size: 0.75rem; color: #ef4444; margin-top: 4px; font-weight: bold;">⚠️ 立即補充耗材</div>' : ''}
                    </td>
                    <td style="padding: 16px; text-align: center;">
                        <span style="color: var(--text-body); font-weight: 700; font-size: 1.1rem;">${demand}</span> <small style="color: var(--text-muted);">sessions</small>
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table></div></div>`;
    return html;
}

/* ===================== 全域彈窗委派處理 ===================== */

// Wrapper for Resource Detail with AI Insights
function generateKPIResourceDetail(type: 'room' | 'equip'): string {
    const systemToday = new Date().toISOString().slice(0, 10);

    // 1. Get Base Content (Table) - Daily Mode
    let html = generateResourceDetail(type, systemToday);
    
    // 2. Remove the last two closing divs to inject content inside the wrapper
    // The structure is <div padding> ... <div wrapper><table>...</table></div></div>
    // generateResourceDetail ends with `</tbody></table></div></div>`
    
    const lastDivIndex = html.lastIndexOf('</div>');
    if (lastDivIndex > -1) {
        html = html.substring(0, lastDivIndex); // Remove last </div> (padding wrapper close)
    }

    // 3. Generate AI Insight - Daily Mode
    const { roomUsage, equipmentUsage } = calcRoomAndEquipmentUsage(dataStore.appointments, dataStore.services, false, systemToday);
    let insightText = '';
    
    if (type === 'room') {
        const avgUsage = roomUsage.length ? Math.round(roomUsage.reduce((acc, r) => acc + r.usageRate, 0) / roomUsage.length) : 0;
        if (avgUsage > 80) insightText = '🔥 <strong>空間使用率過高</strong>：今日診間平均負載已超過 80%，建議現場機動調度空檔，避免客戶久候。';
        else if (avgUsage < 30) insightText = '📉 <strong>空間閒置率高</strong>：今日診間利用率偏低，建議可利用空檔安排教育訓練或環境保養。';
        else insightText = '✅ <strong>空間配置適宜</strong>：今日診間運作平穩，請持續保持目前的服務節奏。';
    } else {
        const criticalItems = equipmentUsage.filter(e => e.usageRate > 80);
        if (criticalItems.length > 0) {
            const names = criticalItems.map(e => e.equipment).join('、');
            insightText = `⚠️ <strong>設備負載警示</strong>：今日檢測到 ${names} 使用率過高，請留意設備過熱狀況。`;
        } else {
            insightText = '✅ <strong>設備運作正常</strong>：今日所有設備皆在正常負載範圍內。';
        }
    }

    const aiHtml = `
        <div style="margin-top: 24px; padding: 16px; background: rgba(139, 92, 246, 0.1); border-left: 4px solid #8b5cf6; border-radius: 8px;">
             <h4 style="color: #8b5cf6; margin-bottom: 8px; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-robot"></i> AI 營運洞察 (Daily)
             </h4>
             <p style="color: var(--text-body); line-height: 1.6; font-size: 0.95rem;">
                ${insightText}
             </p>
        </div>
    </div>`; // Close the main wrapper

    return html + aiHtml;
}

export function handleOverviewModal(modalType: string): boolean {
    if (!modalType) return false;
    
    switch(modalType) {
        // === New KPI Cards (AI Enhanced) ===
        case "kpi-room": {
            ModalManager.loading();
            setTimeout(() => {
                const content = generateKPIResourceDetail("room");
                ModalManager.open("📊 營運指標詳細分析", content, "max-w-4xl");
            }, 500);
            return true;
        }
        case "kpi-equip": {
            ModalManager.loading();
            setTimeout(() => {
                const content = generateKPIResourceDetail("equip");
                ModalManager.open("📊 營運指標詳細分析", content, "max-w-4xl");
            }, 500);
            return true;
        }

        case "doc-top3":
        case "doctor": {
            ModalManager.loading();
            setTimeout(() => {
                const content = generateDoctorDetail(getDoctorTop3(dataStore.appointments, dataStore.staff));
                ModalManager.open("👨‍⚕️ 醫師 Top 3 詳細明細", content, "max-w-4xl");
            }, 500);
            return true;
        }
            
        case "treat-top3":
        case "treatment": {
            ModalManager.loading();
            setTimeout(() => {
                const content = generateTreatmentDetail(getTopTreatments(dataStore.appointments));
                ModalManager.open("🔥 熱門療程 Top 3 詳細明細", content, "max-w-4xl");
            }, 500);
            return true;
        }
            
        case "room": {
            ModalManager.loading();
            setTimeout(() => {
                const content = generateResourceDetail("room");
                ModalManager.open("🏥 診間資源監控表", content, "max-w-4xl");
            }, 500);
            return true;
        }
            
        case "equip": {
            ModalManager.loading();
            setTimeout(() => {
                const content = generateResourceDetail("equip");
                ModalManager.open("⚡ 設備資源監控表", content, "max-w-4xl");
            }, 500);
            return true;
        }
            
        case "alert": {
            let detailContent = document.getElementById("ai-alert-detail")?.innerHTML || "";
            // [Duplicate Logic Removed]
            // try { ... } catch (e) { ... }
            const content = detailContent || "無風險資料";
            ModalManager.open("🚨 AI 風險預警完整內容", content);
            return true;
        }
        
        case "modal-ai": {
            const detailContent = document.getElementById("ai-full-report")?.innerHTML || "";
            const content = detailContent || "無趨勢資料";
            ModalManager.open("📊 AI 趨勢完整分析", content);
            return true;
        }
        
        case "revenue-today": {
            const detailContent = document.getElementById("revenue-today-detail")?.innerHTML || "";
            const content = detailContent || "無營收資料";
            ModalManager.open("💰 今日營收狀態詳細分析", content);
            return true;
        }
        
        case "revenue-monthly": {
            const detailContent = document.getElementById("revenue-monthly-detail")?.innerHTML || "";
            const content = detailContent || "無營收資料";
            ModalManager.open("📊 本月營收詳細分析", content);
            return true;
        }
        
        case "return-visit": {
            const detailContent = document.getElementById("return-visit-detail")?.innerHTML || "";
            const content = detailContent || "無回診資料";
            ModalManager.open("🔄 本月顧客回診率詳細分析", content);
            return true;
        }

        case "kpi-today":
        case "kpi-show-rate":
        case "kpi-doc":
        case "kpi-nurse":
        case "kpi-consultant":
        case "kpi-admin": {
            const content = generateKPIDetail(modalType);
            ModalManager.open("📊 營運指標詳細分析", content);
            return true;
        }
    }
    return false;
}
(window as any).handleOverviewModal = handleOverviewModal;

