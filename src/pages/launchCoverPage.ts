import { dataStore } from "../data/dataStore.js";
import { openChurnRiskViewGlobal, getCoreChurnRiskCustomers } from "./customersPage.js";
import { formatNTRevenue } from "../utils/currencyFormatter.js";
import { TaskStore } from "../data/taskStore.js";
import { externalIntelligence } from "../services/ExternalIntelligenceService.js";

/**
 * Launch Cover Page
 * 系統啟動封面頁 - 2026 醫美經營智慧大腦
 * 
 * 功能：
 * 1. 載入並顯示三個核心 KPI（營收、VIP 人數、風險客群）
 * 2. 提供優雅的進入儀表板動畫
 * 3. 處理資料載入狀態與錯誤
 */

interface LaunchCoverData {
    monthlyRevenue: number;
    monthlyRevenueFormatted: string;
    vipCount: number;
    riskCount: number;
    riskBreakdown?: { high: number, medium: number, low: number };
    lastUpdatedTime: string;
    windowLabel: string;
    isLoaded: boolean;
    errorMessage?: string;
    reminders?: Array<{ title: string, desc: string, diffDays?: number, type: 'task' | 'external', id?: string }>;
}

/**
 * 初始化啟動封面頁
 */
/**
 * 初始化啟動封面頁 (Robust & Non-blocking)
 */
export async function initLaunchCover(): Promise<void> {
    console.log("[Launch Cover] 初始化中...");
    
    const coverContainer = document.getElementById("launch-cover");
    if (!coverContainer) {
        console.error("[Launch Cover] 找不到容器 #launch-cover");
        return;
    }

    // 鎖定滾動
    document.body.style.overflow = 'hidden';

    // 顯示封面與 Skeleton
    coverContainer.style.display = "flex";
    showLoadingState(coverContainer);

    // [效能優化] 讓瀏覽器有機會先繪製 Skeleton (Yield to main thread)
    await new Promise(r => requestAnimationFrame(r));
    
    // 1. 啟動背景圖片延遲載入 (200ms 後，不阻塞首屏)
    setTimeout(() => {
        coverContainer.classList.add('bg-loaded');
    }, 200);

    // 2. 啟動 AI 連線測試 (Non-blocking / Fire-and-forget)
    // 不等待結果，僅更新內部狀態，避免阻塞 UI
    setTimeout(() => {
        externalIntelligence.testConnectivity().then(res => {
            console.log(`[Launch Cover] AI Connectivity: ${res.success} (${res.message})`);
            // 可選：更新 UI 顯示 AI 狀態
        });
    }, 500);
    
    // 安全機制：若 12 秒後沒反應，強制顯示離線模式 (比 dataStore timeout 稍長)
    const safetyTimeout = setTimeout(() => {
        if (!coverContainer.classList.contains('loaded')) {
            console.warn("[Launch Cover] 系統回應較慢，啟用備援顯示...");
            // 不視為錯誤，而是顯示部分資料或離線狀態
            renderErrorState(coverContainer, "首次載入可能較慢，已切換為離線模式");
            bindInteractiveEvents(coverContainer);
        }
    }, 12000);
    
    try {
        // 3. 載入資料 (基礎數據 Bootstrap)
        // [New Strategy] Load lightweight data first, render UI, then load heavy data
        if (!dataStore.isBootstrapLoaded) {
            await dataStore.loadBootstrap();
        }
        
        // Check for Bootstrap Failure
        if (dataStore.bootstrapError) {
             throw new Error(dataStore.bootstrapError);
        }

        // 4. Trigger Heavy Data Load (Background)
        // Do NOT await here. Let it load while user views the cover.
        if (!dataStore.isAppointmentsLoaded) {
            dataStore.prefetchCoreData().then(() => {
                console.log("[Launch Cover] Appointments loaded in background. Refreshing UI...");
                
                // 1. Update Global Month Selector (in main.ts)
                (window as any).updateMonthSelector?.();

                // 2. Only refresh Cover UI if cover is still visible
                if (coverContainer.style.display !== 'none') {
                   (window as any).refreshLaunchCoverData(); 
                }
            }).catch(e => console.warn("Background load failed:", e));
        }

        // 5. 計算 KPI (Partial Data is OK)
        const coverData = await calculateLaunchCoverData();
        
        clearTimeout(safetyTimeout);
        coverContainer.classList.add('loaded'); // 標記已完成

        // 6. 渲染封面
        renderCoverContent(coverContainer, coverData);
        
    } catch (err) {
        // 萬一發生未捕捉錯誤 (Critical Fail)
        clearTimeout(safetyTimeout);
        console.error("[Launch Cover] Critical Init Error:", err);
        renderErrorState(coverContainer, "無法載入基礎營運數據");
    } finally {
        // 確保永遠綁定事件，讓用戶能離開
        bindInteractiveEvents(coverContainer);
    }

    // Expose refresh function
    (window as any).refreshLaunchCoverData = async () => {
        // Re-calculate with whatever data we have now
        const coverData = await calculateLaunchCoverData();
        // Update UI
        renderCoverContent(coverContainer, coverData);
        // Re-bind events since we replaced innerHTML
        bindInteractiveEvents(coverContainer);
    };
}

/**
 * 計算並準備 Launch Cover 所需的所有數據 (Async & Safe)
 */
async function calculateLaunchCoverData(): Promise<LaunchCoverData> {
    try {
        console.log("[Launch Cover] 開始計算 KPI 數據...");
        
        // 1. 月營收
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const todayStr = new Date().toISOString().slice(0, 10);
        
        const monthlyAppointments = dataStore.appointments.filter(apt => 
            apt.date.startsWith(currentMonth) &&
            apt.status === "completed" &&
            apt.date <= todayStr &&
            apt.service_item
        );
        
        const monthlyRevenue = monthlyAppointments.reduce((sum, apt) => {
            const dynamicAmount = apt.amount;
            if (dynamicAmount !== undefined) return sum + dynamicAmount;
            const service = dataStore.services.find(s => s.service_name === apt.service_item);
            return sum + (service?.price || 0);
        }, 0);
        
        // Display Loading or Value
        const monthlyRevenueFormatted = dataStore.isAppointmentsLoaded 
            ? formatNTRevenue(monthlyRevenue, 'compact')
            : "同步中...";
        
        // 2. VIP Count
        const vipCount = calculateVIPCount();
        
        // 3. 風險客群
        const riskList = getCoreChurnRiskCustomers();
        const riskCount = riskList.length;
        const riskBreakdown = {
            high: riskList.filter(c => c.riskLevel === 'high').length,
            medium: riskList.filter(c => c.riskLevel === 'medium').length,
            low: riskList.filter(c => c.riskLevel === 'low').length
        };
        
        // 4. 更新時間
        const now = new Date();
        const lastUpdatedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const windowLabel = `本月 (${currentMonth})`;

        // 5. Tasks Reminders & External Alerts
        const activeReminders: Array<{ title: string, desc: string, diffDays?: number, type: 'task' | 'external', id?: string }> = [];
        
        // Tasks Logic (Sync)
        const allTasks = TaskStore.getTasks();
        const pendingTasks = allTasks.filter(t => t.status === 'pending' && t.dueDate && t.reminders?.length);
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);

        pendingTasks.forEach(task => {
            if (!task.dueDate || !task.reminders) return;
            const due = new Date(task.dueDate);
            if (isNaN(due.getTime())) return;
            due.setHours(0,0,0,0);
            const diffTime = due.getTime() - todayStart.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // diffDays >= 0 means not overdue or today. If user wants overdue shown, logic differs.
            const isHit = diffDays >= 0 && task.reminders.some(r => diffDays <= r);
            if (isHit) {
                activeReminders.push({ 
                    title: task.title, 
                    desc: '系統建議您儘速檢視任務進度。',
                    diffDays, 
                    type: 'task', 
                    id: task.id 
                });
            }
        });

        // External Alerts (Async - Isolated to prevent block)
        try {
             // 限制 AI 檢查時間，避免卡住
            const extAlerts = await Promise.race([
                externalIntelligence.checkActiveAlerts(),
                new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 2000)) // 2s timeout for alerts
            ]);
            
            extAlerts.forEach(alert => {
                activeReminders.push({
                    title: alert.title,
                    desc: alert.message,
                    diffDays: 0,
                    type: 'external'
                });
            });
        } catch (e) {
            console.warn("[Launch Cover] External Alerts skipped due to error/timeout");
        }

        // Sort by urgency
        activeReminders.sort((a, b) => (a.diffDays ?? 999) - (b.diffDays ?? 999));

        return {
            monthlyRevenue,
            monthlyRevenueFormatted,
            vipCount,
            riskCount,
            riskBreakdown,
            lastUpdatedTime,
            windowLabel,
            isLoaded: true,
            reminders: activeReminders
        };
    } catch (error) {
        console.error("[Launch Cover] 计算 KPI 時發生錯誤:", error);
        // Fallback Data
        return {
            monthlyRevenue: 0,
            monthlyRevenueFormatted: "--",
            vipCount: 0,
            riskCount: 0,
            riskBreakdown: { high: 0, medium: 0, low: 0},
            lastUpdatedTime: "--",
            windowLabel: "離線模式",
            isLoaded: true, // Allow render even if calculation failed partial
            errorMessage: "部分數據無法同步"
        };
    }
}

/**
 * 計算核心 VIP 人數
 * 使用簡化的標準確保能正確統計
 */
function calculateVIPCount(): number {
    console.log("[VIP] === 開始計算 VIP 人數 ===");
    
    const customers = dataStore.customers;
    if (!customers || customers.length === 0) {
        console.warn("[VIP] ❌ 沒有顧客資料");
        return 0;
    }
    
    console.log(`[VIP] ✓ 顧客總數: ${customers.length}`);
    
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr);
    
    let vipCount = 0;
    let qualifiedCustomers = 0;
    
    // 使用更簡單的 VIP 標準
    customers.forEach(c => {
        if (!c.last_visit_date) {
            return;
        }
        
        qualifiedCustomers++;
        
        // 計算天數
        const lvDate = new Date(c.last_visit_date);
        const diffDays = Math.ceil((today.getTime() - lvDate.getTime()) / (1000 * 60 * 60 * 24));
        const visits = c.visit_count || 0;
        
        // VIP 標準：極度寬鬆
        // 1. 最近 120 天內有來訪 AND
        // 2. 總訪問次數 >= 3 次
        const isRecent = diffDays <= 120;
        
        // Dynamic VIP Threshold
        const configVip = parseInt(localStorage.getItem('config_vip_quantile') || '80', 10);
        // Map 80 -> 3 visits, 90 -> 5 visits, 60 -> 2 visits
        let visitThreshold = 3;
        if (configVip >= 90) visitThreshold = 5;
        else if (configVip >= 80) visitThreshold = 3;
        else if (configVip >= 60) visitThreshold = 2;
        else visitThreshold = 1;

        const isFrequent = visits >= visitThreshold;
        
        if (isRecent && isFrequent) {
            vipCount++;
            if (vipCount <= 10) {
                console.log(`[VIP] ✓ VIP #${vipCount}: ${c.customer_id}, 訪問=${visits}次, 最後=${diffDays}天前`);
            }
        }
    });
    
    console.log(`[VIP] ✓ 有最後訪問日期的顧客: ${qualifiedCustomers}`);
    console.log(`[VIP] ✓ 符合 VIP 標準的顧客: ${vipCount}`);
    
    // Fallback: 如果仍然是 0，使用最寬鬆的標準
    if (vipCount === 0) {
        console.warn("[VIP] ⚠️ 使用 Fallback: 計算訪問次數 >= 2 的顧客");
        customers.forEach(c => {
            if ((c.visit_count || 0) >= 2) {
                vipCount++;
            }
        });
        console.log(`[VIP] Fallback 結果: ${vipCount} 位（訪問 >= 2次）`);
    }
    
    console.log(`[VIP] === 最終 VIP 人數: ${vipCount} ===`);
    
    return vipCount;
}

/**
 * 計算風險客群總數
 * 與 customersPage.ts 的 getCoreChurnRiskCustomers 保持一致
 */
function calculateRiskCount(): number {
    return getCoreChurnRiskCustomers().length;
}

/**
 * 顯示載入中的 Skeleton 狀態
 */
function showLoadingState(container: HTMLElement): void {
    container.innerHTML = `
        <div class="launch-cover-content">
            <h1 class="launch-title">醫美經營智慧大腦｜啟動中心</h1>
            
            <div class="launch-grid">
                <!-- 左側：亮點區 (60%) -->
                <div class="launch-card launch-highlight">
                    <div class="skeleton skeleton-text skeleton-large" style="margin-bottom: 20px;"></div>
                    <div class="skeleton skeleton-text skeleton-medium"></div>
                </div>
                
                <!-- 右側：行動區 (40%) -->
                <div class="launch-card launch-action">
                    <div class="skeleton skeleton-text skeleton-medium" style="margin-bottom: 15px;"></div>
                    <div class="skeleton skeleton-text skeleton-small"></div>
                </div>
            </div>
            
            <div class="launch-status">
                <div class="loading-spinner"></div>
                <p>正在同步今日營運指標…</p>
            </div>
        </div>
    `;
}

/**
 * 渲染封面內容（資料載入成功）
 */
function renderCoverContent(container: HTMLElement, data: LaunchCoverData): void {
    container.innerHTML = `
        <div class="launch-cover-content">
            <h1 class="launch-title">醫美經營智慧大腦｜啟動中心</h1>
            
            <div class="launch-info-bar">
                資料更新：${data.lastUpdatedTime}｜視窗：${data.windowLabel}
            </div>

            <!-- 三個並排的玻璃卡片 -->
            <div class="launch-cards-grid">
            <!-- 卡片 1: 營收 -->
                <div class="launch-glass-card card-revenue" id="card-revenue-btn" data-hint="前往｜療程營收">
                    <div class="card-icon">💰</div>
                    <div class="card-label">本月總營收</div>
                    <div class="card-value">${data.monthlyRevenueFormatted}</div>
                </div>
                
                <!-- 卡片 2: VIP -->
                <div class="launch-glass-card card-vip" id="card-vip-btn" data-hint="前往｜顧客洞察（RFM）">
                    <div class="card-icon">💎</div>
                    <div class="card-label">核心 VIP 人數</div>
                    <div class="card-value">${data.vipCount} <span class="card-unit">位</span></div>
                </div>
                
                <!-- 卡片 3: 待關懷 -->
                <div class="launch-glass-card card-action" id="card-risk-btn" data-hint="前往｜流失風險名單">
                    <div class="card-icon">🔔</div>
                    <div class="card-label">本日優先行動</div>
                    <div class="card-value">${data.riskCount} <span class="card-unit">位</span></div>
                    <div class="card-subtext">
                        <span style="${(data.riskBreakdown?.medium || 0) > 0 ? 'color: #fbbf24; font-weight: bold;' : 'color: rgba(255,255,255,0.35);'}">
                            中風險 ${data.riskBreakdown?.medium || 0}
                        </span>
                        <span class="subtext-divider">｜</span>
                        <span style="color: rgba(255,255,255,0.6);">
                            低風險 ${data.riskBreakdown?.low || 0}
                        </span>
                        <span class="subtext-divider">｜</span>
                        <span style="${(data.riskBreakdown?.high || 0) > 0 ? 'color: #ef4444; font-weight: bold;' : 'color: rgba(255,255,255,0.35);'}">
                            高風險 ${data.riskBreakdown?.high || 0}
                        </span>
                    </div>
                </div>
            </div>
            
            <button class="launch-enter-btn" id="btn-enter-dashboard">
                <span>開始今日數據決策</span>
                <i class="fa-solid fa-arrow-right"></i>
            </button>
            
            <!-- 即時任務預覽區域 -->
            ${(() => {
                if (!data.reminders || data.reminders.length === 0) return '';
                
                // 計算指標 (結合關鍵字與 AI 持久化建議)
                // 計算指標 (結合關鍵字與 AI 持久化建議)
                const RISK_KEYWORDS = ['第一', '治療', '有效', '疾病', '最', '首創', '保證', '外泌體', '根治', '合規'];
                
                // Helper to check risk
                const checkRisk = (r: any) => {
                    // 0. Check System Alert Level
                    if (r.level === 'error' || r.level === 'critical') return true;

                    // 1. Check AI Persisted Result
                    const t = r.id ? TaskStore.getTask(r.id) : null;
                    if (t?.severity === 'high') return true; 
                    if (t?.aiSuggestion && !t.aiSuggestion.isSafe) return true;
                    
                    // 2. Fallback to Keywords
                    return RISK_KEYWORDS.some(k => r.title.includes(k) || r.desc.includes(k));
                };

                const riskReminders = data.reminders.filter(r => checkRisk(r));

                // 將所有提醒存儲到 window 以供通知面板使用
                (window as any).launchCoverReminders = {
                    all: data.reminders,
                    risk: riskReminders,
                    normal: data.reminders.filter(r => !checkRisk(r))
                };
                
                // 取前2筆任務展示
                const topTasks = data.reminders.slice(0, 2);
                const riskCount = riskReminders.length;
                
                return `
                    <div class="launch-task-preview-section">
                        <div class="task-preview-header">
                            <i class="fa-solid fa-clipboard-check"></i>
                            <span>即時任務預覽</span>
                            
                            <!-- 狀態整合 Badge -->
                            <div class="header-badges" style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
                                ${riskCount > 0 ? `
                                    <span style="background: rgba(220, 38, 38, 0.2); color: #f87171; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; border: 1px solid rgba(220, 38, 38, 0.4); display: flex; align-items: center; gap: 4px;">
                                        <i class="fa-solid fa-triangle-exclamation"></i> ${riskCount} 風險
                                    </span>
                                ` : ''}
                                <span class="task-count" style="margin: 0;">${data.reminders.length} 待辦</span>
                            </div>
                        </div>
                        
                        <div class="task-preview-cards">
                            ${topTasks.map(task => {
                                const t = task.id ? TaskStore.getTask(task.id) : null;
                                const aiUnsafe = t?.aiSuggestion && !t.aiSuggestion.isSafe;
                                const isHighRisk = aiUnsafe || checkRisk(task);
                                const borderClass = isHighRisk ? 'task-card-risk' : 'task-card-normal';
                                
                                // 若有 AI 建議，顯示 AI 建議，否則顯示原描述
                                const displayDesc = aiUnsafe 
                                    ? `⚖️ AI 建議：${t?.aiSuggestion?.suggestion}` 
                                    : (task.desc.length > 25 ? task.desc.substring(0, 25) + '...' : task.desc);
                                
                                return `
                                    <div class="launch-task-card ${borderClass}" onclick="window.switchPage('tasks')">
                                        <div class="task-card-header">
                                            <div class="task-card-icon ${isHighRisk ? 'icon-risk' : 'icon-normal'}" style="${isHighRisk ? 'color: #ef4444;' : ''}">
                                                <i class="fa-solid ${isHighRisk ? 'fa-triangle-exclamation' : 'fa-bell'}"></i>
                                            </div>
                                            <div class="task-card-title">
                                                ${task.title}
                                                ${isHighRisk ? `<span class="risk-tag" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.5);">${aiUnsafe ? 'AI 警示' : '違規風險'}</span>` : ''}
                                            </div>
                                        </div>
                                        <div class="task-card-desc" style="${aiUnsafe ? 'color: #fca5a5;' : ''}">${displayDesc}</div>
                                        ${task.diffDays ? `<div class="task-card-meta"><i class="fa-regular fa-clock"></i> 剩 ${task.diffDays} 天</div>` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            })()}
        </div>
    `;
}

/**
 * 渲染錯誤狀態（資料載入失敗）
 */
function renderErrorState(container: HTMLElement, errorMessage: string): void {
    container.innerHTML = `
        <div class="launch-cover-content">
        <div class="launch-cover-content">
            <h1 class="launch-title">醫美經營智慧大腦｜啟動中心</h1>
            
            <div class="launch-grid">
                <!-- 左側：亮點區 -->
                <div class="launch-card launch-highlight launch-error">
                    <div class="error-icon">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <div class="error-message">
                        <p>${errorMessage}</p>
                        <small>將使用離線模式進入系統</small>
                    </div>
                </div>
                
                <!-- 右側：行動區 -->
                <div class="launch-card launch-action launch-disabled">
                    <div class="action-tag">資料同步中斷</div>
                    <div class="metric-placeholder">--</div>
                </div>
            </div>
            
            <button class="launch-enter-btn launch-enter-btn-offline" id="btn-enter-dashboard">
                <span>繼續使用離線模式</span>
                <i class="fa-solid fa-arrow-right"></i>
            </button>
            
            <button class="launch-enter-btn" style="margin-top: 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4);" onclick="location.reload()">
                <span><i class="fa-solid fa-rotate-right"></i> 重試連線</span>
            </button>
        </div>
    `;
}

/**
 * 綁定互動事件（按鈕與卡片）
 */
function bindInteractiveEvents(container: HTMLElement): void {
    // 1. Enter Button
    const enterBtn = container.querySelector("#btn-enter-dashboard");
    if (enterBtn) {
        enterBtn.addEventListener("click", () => {
            performExit(container);
        });
    }

    // 2. Card 1: Revenue -> Services Page (Revenue Structure)
    const revenueCard = container.querySelector("#card-revenue-btn");
    if (revenueCard) {
        revenueCard.addEventListener("click", () => {
            performExit(container, () => {
                navigateToTab('services');
                // Scroll to chart if needed, but default top is fine
                // section id="services" has charts visible
            });
        });
    }

    // 3. Card 2: VIP -> Customers Page (Focus RFM)
    const vipCard = container.querySelector("#card-vip-btn");
    if (vipCard) {
        vipCard.addEventListener("click", () => {
            performExit(container, () => {
                navigateToTab('customers');
                // Wait for render then scroll
                setTimeout(() => {
                    const rfmChart = document.getElementById("custRFMChart");
                    if (rfmChart) {
                        rfmChart.scrollIntoView({ behavior: "smooth", block: "center" });
                        // Optional: Flash highlight
                        rfmChart.parentElement?.style.setProperty("box-shadow", "0 0 20px rgba(59, 130, 246, 0.5)");
                        setTimeout(() => rfmChart.parentElement?.style.removeProperty("box-shadow"), 1000);
                    }
                }, 600);
            });
        });
    }

    // 4. Card 3: Risk -> Customers Page (Open Modal)
    const riskCard = container.querySelector("#card-risk-btn");
    if (riskCard) {
        riskCard.addEventListener("click", () => {
            performExit(container, () => {
                navigateToTab('customers');
                // Wait for render then open view
                setTimeout(() => {
                    openChurnRiskViewGlobal();
                }, 600);
            });
        });
    }

    // 5. Reminders Actions
    const reminderBtns = container.querySelectorAll(".reminder-action-btn");
    reminderBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const taskId = (e.currentTarget as HTMLElement).dataset.taskId;
            if (taskId) {
                performExit(container, () => {
                    // Navigate to Tasks and Open Modal
                    navigateToTab('tasks');
                    // wait for render
                    setTimeout(() => {
                        if ((window as any).editTask) {
                            (window as any).editTask(taskId);
                        } else {
                            console.error("window.editTask not found");
                        }
                    }, 500);
                });
            }
        });
    });
}

/**
 * 執行離開動畫並切換頁面
 */
function performExit(container: HTMLElement, postAction?: () => void) {
    // 淡出封面
    container.classList.add("launch-cover-exit");
    
    // 300-450ms 後移除封面並顯示主儀表板
    setTimeout(() => {
        container.style.display = "none";
        container.classList.remove("launch-cover-exit");
        
        // 解除滾動鎖定
        document.body.style.overflow = ''; // Restore default
        // Double check
        if (getComputedStyle(document.body).overflow === 'hidden') {
            document.body.style.overflow = 'auto';
        }
        
        // 顯示主應用容器
        const appContainer = document.querySelector(".app-container");
        if (appContainer) {
            (appContainer as HTMLElement).style.display = "flex";
        }
        
        console.log("[Launch Cover] 已進入儀表板，主容器顯示中");

        // 使用 requestAnimationFrame 確保 DOM 更新後再執行點擊導航
        // 這能解決某些情況下從 hidden -> visible 瞬間點擊無效的問題
        requestAnimationFrame(() => {
            if (postAction) {
                console.log("[Launch Cover] 執行後續導航動作...");
                postAction();
            }
        });
    }, 400);
}

/**
 * Helper: Switch Tab via Global Controller
 */
function navigateToTab(tabName: string) {
    if (window.switchPage) {
        window.switchPage(tabName);
    } else {
        console.error(`[Navigation] window.switchPage is not defined. Fallback to manual click.`);
        const navItem = document.querySelector(`.nav-links li[data-tab="${tabName}"]`) as HTMLElement;
        if (navItem) navItem.click();
    }
}

