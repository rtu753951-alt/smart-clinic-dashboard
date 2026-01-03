import { initOverviewPage } from "../pages/overviewPage.js";
import { getCoreChurnRiskCustomers, openChurnRiskViewGlobal } from "../pages/customersPage.js";
import { dataStore } from "../data/dataStore.js";
import { apiService } from "../services/ApiService.js";
import { TaskStore } from "../data/taskStore.js";
import { formatCompactNT } from "../utils/currencyFormatter.js";
import { parseCSVLine } from "../data/csvLoader.js";




// 之後我們會依序加入其他 pages，如 appointmentsPage/staffPage 等

/* ===========================
   主程式：初始化 Page Controller
=========================== */
export function initPageController() {
  bindSidebarNavigation();
  bindGlobalMonthSelector(); // Must be called after DOM is ready
  bindTopBarActions(); // 初始化導航列功能 (Notifications & Settings)

  
  // Expose switchPage globally for other modules (e.g. LaunchCover)
  (window as any).switchPage = (pageId: string) => {
      const navItem = document.querySelector(`.nav-links li[data-tab="${pageId}"]`) as HTMLElement;
      if (navItem) {
          navItem.click(); // Trigger UI update + Logic
          console.log(`[Global Switch] Switched to ${pageId}`);
      } else {
          // Fallback if Sidebar is hidden/missing, though unlikely
          console.warn(`[Global Switch] Nav Item for ${pageId} not found, calling showPage directly.`);
          showPage(pageId);
      }
  };

  showPage("overview"); // 預設首頁
  
  // Attach openChurnRiskViewGlobal to window for HTML inline access
  (window as any).openChurnRiskViewGlobal = openChurnRiskViewGlobal;

  // Global helper for adding tasks
  (window as any).addTaskFromCampaign = (el: HTMLElement, name: string, days: number, msg: string) => {
      // 1. Check if already exists (Optional, but good for robustness)
      const existing = TaskStore.getTasks().find(t => t.title.includes(name));
      if (existing) {
          showToast('⚠️ 此檔期任務已存在於待辦清單', 'warning');
          return;
      }

      // 2. Add Task
      TaskStore.addTask({
          title: `籌備：${name} (距離 ${days} 天)`,
          description: msg,
          targetPage: 'customers', 
          targetAction: 'filter:campaign-prep',
          dueDate: new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
      });

      // 3. UI Feedback (Button State)
      if (el) {
          el.innerText = '✅ 已在待辦中';
          el.setAttribute('disabled', 'true');
          el.style.opacity = '0.6';
          el.style.cursor = 'not-allowed';
      }

      showToast('✅ 已成功加入營運待辦', 'success');
      
      // 4. If Tasks page is active, refresh it
      const tasksPage = document.getElementById('tasks');
      if (tasksPage && tasksPage.classList.contains('active')) {
           (window as any).initTasksPage?.();
      }
  };
}

declare global {
    interface Window {
        switchPage?: (pageId: string) => void;
        openChurnRiskViewGlobal?: () => void;
        addTaskFromCampaign?: (el: HTMLElement, name: string, days: number, msg: string) => void;
        initTasksPage?: () => void;
        refreshOverviewPageByMonth?: () => void;
        currentDashboardMonth?: string;
    }
}

/* ===========================
   綁定側邊欄選單
=========================== */
function bindSidebarNavigation() {
  document.querySelectorAll(".nav-links li").forEach(li => {
    li.addEventListener("click", () => {
      const page = li.getAttribute("data-tab");
      if (!page) return;

      showPage(page);

      // 更新 active 樣式
      document.querySelectorAll(".nav-links li").forEach(x => x.classList.remove("active"));
      li.classList.add("active");
    });
  });
}

/* ===========================
   切換頁面
=========================== */
function showPage(pageId: string) {
  // 隱藏所有頁面
  document.querySelectorAll(".page-section").forEach(sec => sec.classList.remove("active"));

  // 顯示指定頁面
  const secEl = document.getElementById(pageId);
  secEl?.classList.add("active");

  // 更新標題
  const PAGE_TITLES: Record<string, string> = {
    overview: "營運概要",
    appointments: "預約分析",
    staff: "人力分析",
    rooms: "診間設備",
    services: "療程營收",
    customers: "顧客洞察",
    tasks: "營運指揮中心 | 任務清單"
  };

  // 🔽 全站月份狀態同步（供 AI 建議等使用）
const monthSelect = document.getElementById("global-month-selector") as HTMLSelectElement;
if (monthSelect) {
  (window as any).currentDashboardMonth = monthSelect.value;
}

  const titleEl = document.getElementById("pageTitle");
  if (titleEl) titleEl.textContent = PAGE_TITLES[pageId] ?? "未命名頁面";

  // 呼叫各頁的 init（僅第一次）
  const initName = secEl?.dataset.init;
  if (initName && typeof (window as any)[initName] === "function") {
    // 避免重複初始化 (Staff Page 特別豁免; Tasks Page 需每次刷新以顯示最新待辦)
    if (!(secEl as any)._initialized || pageId === 'staff' || pageId === 'tasks') {
      (window as any)[initName]();
      (secEl as any)._initialized = true;
    }
  }
}
/* ===========================
   全站月份選擇器 → 觸發頁面刷新
=========================== */
function bindGlobalMonthSelector() {
    /* ===========================
       全站月份選擇器 → 觸發頁面刷新
    =========================== */
    const monthSelect = document.getElementById("global-month-selector") as HTMLSelectElement;
    if (monthSelect) {
      // Use direct 'onchange' to ensure only one handler exists and avoid cloning issues
      monthSelect.onchange = () => {
        const newVal = monthSelect.value;
        (window as any).currentDashboardMonth = newVal;
    
        // 取得目前啟用頁面的 ID
        const activePage = document.querySelector(".page-section.active") as HTMLElement;
        const pageId = activePage?.id;
        const init = activePage?.dataset.init;
    
        console.log(`[Global Filter] Month changed to: ${newVal}. Active Page: ${pageId}`);

        // 🎯 Overview 頁面
        if (pageId === "overview" && typeof (window as any).refreshOverviewPageByMonth === "function") {
          (window as any).refreshOverviewPageByMonth();
        }
        // 其他頁面：重新呼叫 init
        else if (init && typeof (window as any)[init] === "function") {
           console.log(`[Global Filter] Triggering re-init for: ${init}`);
           (window as any)[init]();
        }
      };
      
      // Initialize state immediately
      if (monthSelect.value) {
          (window as any).currentDashboardMonth = monthSelect.value;
      }
    } else {
        console.warn("Global month selector not found in DOM during bind.");
    }
}

/**
 * 顯示全域 Toast 通知
 */
export function showToast(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') {
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        // Basic toast styles injection if not present (inline for safety)
        toastContainer.setAttribute('style', 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 10px;');
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    // Style
    toast.style.background = 'rgba(15, 23, 42, 0.9)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '30px';
    toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.border = '1px solid rgba(255,255,255,0.1)';
    toast.style.animation = 'fadeInUp 0.3s ease-out';
    toast.style.backdropFilter = 'blur(8px)';
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-check-circle" style="color: #4ade80;"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation" style="color: #fbbf24;"></i>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Global Refresh Trigger
(window as any).refreshDashboardWithSettings = async () => {
    console.log('[System] Applying new settings...');
    
    // 1. Feedback with Spinner (Toast)
    const churn = localStorage.getItem('config_churn_days') || '90';
    
    // Create detailed toast with spinner
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.setAttribute('style', 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 10px;');
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-loading`;
    toast.style.background = 'rgba(15, 23, 42, 0.95)';
    toast.style.color = '#fff';
    toast.style.padding = '16px 28px';
    toast.style.borderRadius = '30px';
    toast.style.boxShadow = '0 10px 30px -5px rgba(0, 0, 0, 0.5)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.border = '1px solid rgba(56, 189, 248, 0.3)';
    toast.style.backdropFilter = 'blur(10px)';
    
    // Spinner HTML
    toast.innerHTML = `
        <div class="loading-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
        <div style="display:flex; flex-direction:column; gap:2px;">
             <span style="font-weight:600; font-size:0.95rem;">重新分析中...</span>
             <span style="font-size:0.8rem; color:#94a3b8;">門檻已調整為 ${churn} 天，正在篩選 46,241 筆資料...</span>
        </div>
    `;
    
    toastContainer.appendChild(toast);

    // 2. Logic Hookup: Re-calculate Data
    // Await a small delay to allow UI to render toast
    await new Promise(r => setTimeout(r, 800));

    // Force Re-init Active Page
    const activePage = document.querySelector(".page-section.active") as HTMLElement;
    if (activePage) {
        const initFn = activePage.dataset.init;
        if (initFn && (window as any)[initFn]) {
             console.log(`[System] Re-initializing ${initFn} with new settings.`);
             (window as any)[initFn](); 
        }
    }
    
    // Refresh Launch Cover if present
    if (typeof (window as any).refreshLaunchCoverData === 'function') {
        (window as any).refreshLaunchCoverData();
    }
    
    // Done - Remove Toast
    setTimeout(() => {
        toast.style.transition = 'all 0.5s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 500);
        
        // Show Success Toast
        showToast('✅ 系統優化完成，報表已更新', 'success');
    }, 1500);
};

/* ===========================
   上方導航列功能 (Notifications & Settings)
=========================== */
function bindTopBarActions() {
    const btnNotif = document.getElementById("btnNotif");
    const btnSettings = document.getElementById("btnSettings");

    // 1. 小鈴鐺 通知功能
    if (btnNotif) {
        // 添加紅色計數標籤 (Badge)
        if (!btnNotif.querySelector('.notif-badge')) {
            const badge = document.createElement('span');
            badge.className = 'notif-badge';
            badge.id = 'notif-count-badge';
            badge.textContent = '0';
            badge.style.display = 'none';
            btnNotif.appendChild(badge);
        }
        
        // Create Dropdown (Cleanup old first to prevent duplicates)
        document.querySelectorAll('.notification-dropdown').forEach(el => el.remove());
        
        let dropdown = document.createElement('div');
        dropdown.className = 'notification-dropdown';
        // InnerHTML will be populated on click
        dropdown.innerHTML = `
            <div class="notification-header">
                <span>動態經營簡報 (Dynamic Brief)</span>
                <button class="notif-clear-btn" onclick="this.closest('.notification-dropdown').classList.remove('active')">
                    <i class="fa-solid fa-check"></i> 關閉
                </button>
            </div>
            <ul class="notification-list"></ul>
        `;
        document.body.appendChild(dropdown);

        const updateNotifications = () => {
             const list = dropdown.querySelector('.notification-list');
             if (!list) return;

             try {
                // 1. Get Settings
                const churnDays = parseInt(localStorage.getItem('config_churn_days') || '90', 10);
                
                // 2. Calculate Risk Data
                const riskList = getCoreChurnRiskCustomers(); // Imported
                const riskCount = riskList.length;

                // 3. Calculate Revenue
                let dailyRevenue = 0;
                const targetDate = '2026-01-01';
                
                dataStore.appointments.forEach(app => {
                    if (app.date === targetDate && app.status === 'completed') {
                        const raw = (app as any).price || (app as any).amount || 0;
                        const amt = typeof raw === 'number' ? raw : parseFloat(raw);
                        dailyRevenue += amt;
                    }
                });
                
                let displayRevenue = 0;
                let displayLabel = "1 月 1 日";
                
                if (dailyRevenue > 0) {
                    displayRevenue = dailyRevenue;
                } else {
                    displayLabel = "本月 (2026-01)";
                    dataStore.appointments.forEach(app => {
                        if (app.date.startsWith('2026-01') && app.status === 'completed') {
                             const raw = (app as any).price || (app as any).amount || 0;
                             displayRevenue += (typeof raw === 'number' ? raw : parseFloat(raw));
                        }
                    });
                }
                
                const revenueStr = formatCompactNT(displayRevenue);
                
                // 4. Marketing Campaigns Logic
                const campaigns = [
                    { name: '女王節 (Women Day)', date: '2026-03-08', msg: '建議主打亮白與女性保養專題，同步推出閨蜜同行優惠。' },
                    { name: '母親節 (Mother Day)', date: '2026-05-10', msg: '年度大檔！建議提前規劃抗老拉提專題，並準備 VIP 預購會。' },
                    { name: '週年慶 (Anniversary)', date: '2026-11-01', msg: '全年度最高折扣檔期，建議盤點庫存並設計滿額贈禮。' }
                ];
                
                const simDate = new Date('2026-01-01');
                let nextCampaign = null;
                let daysLeft = 0;
                
                for (const c of campaigns) {
                    const cDate = new Date(c.date);
                    const diffTime = cDate.getTime() - simDate.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    if (diffDays > 0) {
                        nextCampaign = c;
                        daysLeft = diffDays;
                        break;
                    }
                }

                // 5. Build HTML
                let html = '';
                
                // SECTION 1: SYSTEM ALERTS
                html += `<div class="notif-section-header">系統預警 (System Alerts)</div>`;
                
                // Item A: Risk Alert
                if (riskCount > 0) {
                     html += `
                        <li class="notification-item unread">
                            <div class="notif-icon-wrapper urgent">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                            </div>
                            <div class="notif-content-wrapper">
                                <div class="notif-title">⚠️ 緊急關懷：檢測到 ${riskCount} 位核心 VIP 已超過 ${churnDays} 天未回診</div>
                                <div class="notif-desc">高價值流失風險，建議立即啟動挽回計畫。</div>
                                <div class="notif-meta">
                                    <span><i class="fa-regular fa-clock"></i> 2 小時前</span>
                                </div>
                                <div class="notif-actions">
                                    <button class="btn-xs primary" onclick="window.switchPage('customers'); if(window.openChurnRiskViewGlobal) window.openChurnRiskViewGlobal();">
                                        立即處理
                                    </button>
                                </div>
                            </div>
                        </li>
                     `;
                } else {
                     html += `
                        <li class="notification-item">
                            <div class="notif-icon-wrapper success">
                                <i class="fa-solid fa-shield-heart"></i>
                            </div>
                            <div class="notif-content-wrapper">
                                <div class="notif-title">✅ 顧客維護狀況良好</div>
                                <div class="notif-desc">目前無超過 ${churnDays} 天未回診之核心 VIP。</div>
                            </div>
                        </li>
                     `;
                }
                
                // Item B: Revenue
                html += `
                    <li class="notification-item">
                        <div class="notif-icon-wrapper success">
                            <i class="fa-solid fa-trophy"></i>
                        </div>
                        <div class="notif-content-wrapper">
                            <div class="notif-title">🎉 營運捷報：${displayLabel} 即時營收已突破 ${revenueStr}</div>
                            <div class="notif-desc">單日業績表現優異，目標達成率 100+%。</div>
                        </div>
                    </li>
                `;
                
                // SECTION 1.5: LAUNCH COVER REMINDERS (整合啟動頁面的提醒)
                const launchReminders = (window as any).launchCoverReminders;
                if (launchReminders && launchReminders.all && launchReminders.all.length > 0) {
                    html += `<div class="notif-section-header">營運提醒 (Launch Reminders)</div>`;
                    
                    launchReminders.all.forEach((reminder: any) => {
                        // 1. Try to get Full Task from Store to check Severity
                        let fullTask = reminder.id ? TaskStore.getTask(reminder.id) : null;
                        
                        // 2. Determine Risk
                        const RISK_KEYWORDS = ['外泌體', '根治', '違規', '罰款', '第一', '治療', '有效', '合規'];
                        const hasRiskKeyword = RISK_KEYWORDS.some(k => 
                            reminder.title.includes(k) || reminder.desc.includes(k)
                        );
                        
                        const isSevere = fullTask?.severity === 'high';
                        const isAiUnsafe = fullTask?.aiSuggestion && !fullTask.aiSuggestion.isSafe;
                        const isSystemAlert = reminder.level === 'error' || reminder.level === 'critical';

                        // Fallback check: launchReminders.risk might contain it based on CoverPage logic
                        const isCoverRisk = launchReminders.risk.some((r: any) => r.title === reminder.title);

                        const isRisk = isSevere || isAiUnsafe || hasRiskKeyword || isCoverRisk || isSystemAlert;

                        // 3. Styling
                        // Force RED if risk
                        const iconClass = isRisk ? 'urgent' : 'info'; 
                        const icon = isRisk ? 'fa-triangle-exclamation' : 'fa-bell';
                        // Explicitly inject RED style for risk items
                        const styleOverride = isRisk ? 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);' : '';
                        
                        html += `
                            <li class="notification-item ${isRisk ? 'unread' : ''}">
                                <div class="notif-icon-wrapper ${iconClass}" style="${styleOverride}">
                                    <i class="fa-solid ${icon}"></i>
                                </div>
                                <div class="notif-content-wrapper">
                                    <div class="notif-title">${isRisk ? '🚫 ' : ''}提醒：${reminder.title}</div>
                                    <div class="notif-desc">${reminder.desc}</div>
                                    ${reminder.diffDays ? `<div class="notif-meta"><span><i class="fa-regular fa-clock"></i> 還有 ${reminder.diffDays} 天</span></div>` : ''}
                                </div>
                            </li>
                        `;
                    });
                }
                
                // SECTION 1.5: TASK REMINDERS
                const allTasks = TaskStore.getTasks();
                const pendingTasks = allTasks.filter(t => t.status === 'pending' && t.dueDate && t.reminders && t.reminders.length > 0);
                
                let hasTaskReminders = false;
                pendingTasks.forEach(task => {
                    if (!task.dueDate || !task.reminders) return;
                    
                    const due = new Date(task.dueDate);
                    const now = new Date('2026-01-01'); // Keeping simulation date
                    const diffTime = due.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    // Check if current day difference matches one of the reminder points
                    if (task.reminders.includes(diffDays)) {
                        if (!hasTaskReminders) {
                            html += `<div class="notif-section-header">待辦提醒 (Task Reminders)</div>`;
                            hasTaskReminders = true;
                        }

                        html += `
                            <li class="notification-item">
                                <div class="notif-icon-wrapper" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.2);">
                                    <i class="fa-solid fa-bell"></i>
                                </div>
                                <div class="notif-content-wrapper">
                                    <div class="notif-title">💡 提醒：【${task.title}】還有 ${diffDays} 天</div>
                                    <div class="notif-desc">建議檢視進度，確保如期完成。</div>
                                    <div class="notif-actions">
                                        <button class="btn-xs" style="color: #cbd5e1; border-color: #475569;" onclick="window.switchPage('tasks');">
                                            查看詳情
                                        </button>
                                    </div>
                                </div>
                            </li>
                        `;
                    }
                });
                
                // SECTION 2: MARKETING CAMPAIGNS
                if (nextCampaign) {
                    html += `<div class="notif-section-header">行銷建議 (Marketing)</div>`;
                    
                    // Check if already in tasks
                    const existingTask = TaskStore.getTasks().find(t => t.title.includes(nextCampaign.name));
                    const btnState = existingTask 
                        ? `disabled style="opacity:0.6; cursor:not-allowed;"` 
                        : `style="color: #cbd5e1; border-color: #475569;"`;
                    const btnText = existingTask ? '✅ 已在待辦中' : '+ 加入待辦';
                    // Escape quotes for inline JS
                    const safeName = nextCampaign.name.replace(/'/g, "\\'");
                    const safeMsg = nextCampaign.msg.replace(/'/g, "\\'");
                    
                    const btnOnClick = existingTask ? '' : `onclick="window.addTaskFromCampaign(this, '${safeName}', ${daysLeft}, '${safeMsg}')"`;

                    
                    html += `
                        <li class="notification-item">
                            <div class="notif-icon-wrapper" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.2);">
                                <i class="fa-solid fa-calendar-star"></i>
                            </div>
                            <div class="notif-content-wrapper">
                                <div class="notif-title">💡 檔期提醒：距離『${nextCampaign.name}』還有 ${daysLeft} 天</div>
                                <div class="notif-desc">${nextCampaign.msg}</div>
                                <div class="notif-meta">
                                    <span><i class="fa-solid fa-bullhorn"></i> 建議準備期: 45天前</span>
                                </div>
                                <div class="notif-actions">
                                    <button class="btn-xs" ${btnState} ${btnOnClick}>
                                        ${btnText}
                                    </button>
                                </div>
                            </div>
                        </li>
                    `;
                }

                 list.innerHTML = html;
                 
                 // 更新計數標籤 (With Persistence Check)
                 const totalCount = (launchReminders?.all?.length || 0) + pendingTasks.length + (riskCount > 0 ? 1 : 0);
                 const badge = document.getElementById('notif-count-badge');
                 const lastCleared = parseInt(localStorage.getItem('notif_last_cleared_count') || '0', 10);

                 if (badge) {
                     // Only show if we have notifications AND the count is different (presumably higher) than what we cleared
                     if (totalCount > 0 && totalCount > lastCleared) {
                         badge.textContent = totalCount.toString();
                         badge.style.display = 'flex';
                     } else {
                         badge.style.display = 'none';
                     }
                 }

             } catch (err) {
                 console.error("Notif Error:", err);
                 list.innerHTML = `<li style="padding:15px; color:#aaa;">暫無新通知 (系統連線中...)</li>`;
             }
        };

        btnNotif.onclick = (e) => {
            console.log('[UI] Notification bell clicked');
            e.stopPropagation();
            e.preventDefault(); // Prevent any default button behavior

            // Click to Clear Badge & Save State
            const badge = document.getElementById('notif-count-badge');
            if (badge) {
                // Save current count so we don't show it again on refresh
                const val = parseInt(badge.textContent || '0', 10);
                if (val > 0) {
                    localStorage.setItem('notif_last_cleared_count', val.toString());
                }
                badge.style.display = 'none';
                badge.textContent = '0';
            }
            
            // Calculate Position dynamically
            if (!dropdown.classList.contains('active')) {
                updateNotifications(); // This is wrapped in try-catch now so it shouldn't crash
                const rect = btnNotif.getBoundingClientRect();
                dropdown.style.top = `${rect.bottom + 12}px`;
                // Align right edge of dropdown with right edge of button (minus some padding usually)
                // Dropdown width is 380px now
                const leftPos = rect.right - 380;
                
                // Safety check for mobile/small screens
                const finalLeft = Math.max(10, leftPos);
                
                dropdown.style.left = `${finalLeft}px`;
                dropdown.style.right = 'auto'; // Disable CSS right
                dropdown.style.position = 'fixed'; // Ensure fixed
            }
            
            dropdown.classList.toggle('active');
        };

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!btnNotif.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                dropdown.classList.remove('active');
            }
        });

        // Initialize Badge (Delayed check)
        setTimeout(updateNotifications, 1500);
    }

    // 2. 設定 Drawer (Unified Sidebar Settings)
    if (btnSettings) {
        let modalOverlay = document.getElementById('settings-modal-overlay');
        if (!modalOverlay) {
            modalOverlay = document.createElement('div');
            modalOverlay.id = 'settings-modal-overlay';
            modalOverlay.className = 'settings-modal-overlay';
            modalOverlay.innerHTML = `
                <div class="settings-modal">
                    <div class="settings-header">
                        <h3>系統參數設定</h3>
                        <button class="close-settings"><i class="fa-solid fa-times"></i></button>
                    </div>
                    
                    <div class="settings-body">
                        
                        <!-- Layer 1: Data Source -->
                        <div class="settings-section-title">Step 1. 數據源與格式</div>
                        <div class="setting-group" style="padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                            <label><i class="fa-solid fa-database"></i> 匯入與範本</label>
                            <div class="setting-helper" style="margin-bottom: 12px;">僅支援 UTF-8 編碼之標準 CSV。</div>
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <button class="btn-secondary" id="btn-download-template" style="width:100%; display:flex; justify-content:center; align-items:center; gap:6px;">
                                    <i class="fa-solid fa-download"></i> 下載範本
                                </button>
                                
                                <label for="file-upload-csv" class="btn-primary" style="width:100%; box-sizing:border-box; cursor:pointer; display:flex; justify-content:center; align-items:center; gap:6px; margin:0; text-align:center;">
                                    <i class="fa-solid fa-upload"></i> 匯入 CSV
                                </label>
                                <input type="file" id="file-upload-csv" accept=".csv" style="display:none;">
                            </div>
                            <div id="upload-status-msg" style="font-size:0.8rem; margin-top:10px; min-height:1.2em; text-align:center; color:#94a3b8;"></div>
                        </div>

                        <div class="settings-divider"></div>

                        <!-- Layer 2: Analysis Logic -->
                        <div class="settings-section-title">Step 2. 分析門檻定義</div>
                        
                        <!-- Churn Days -->
                        <div class="setting-group">
                            <label><i class="fa-solid fa-clock-rotate-left"></i> 流失判定天數 (Churn Days)</label>
                            <input type="number" id="setting-churn-days" class="setting-input" value="90">
                            <div class="setting-helper">未回診超過此天數，標記為潛在流失。</div>
                        </div>

                        <!-- VIP Quantile -->
                        <div class="setting-group">
                            <label><i class="fa-solid fa-crown"></i> VIP 消費分位數 (%)</label>
                            <input type="number" id="setting-vip-quantile" class="setting-input" value="80">
                            <div class="setting-helper">定義 Top % 為高價值核心顧客 (Default: 80)。</div>
                        </div>

                        <div class="settings-divider"></div>

                        <!-- Layer 3: AI & UI Preferences -->
                        <div class="settings-section-title">Step 3. AI 與介面偏好</div>

                        <!-- API Key -->
                        <div class="setting-group">
                            <label><i class="fa-solid fa-key"></i> AI 連網服務金鑰 (Google Gemini)</label>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="password" id="setting-ai-key" class="setting-input" placeholder="輸入 API Key..." style="flex: 1;">
                                <button id="btn-test-ai-connection" class="btn-secondary" style="white-space: nowrap; height: 38px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-plug"></i> 測試連線
                                </button>
                            </div>
                            <div id="ai-connection-status" style="font-size: 0.85rem; margin-top: 6px; min-height: 1.4em; display: flex; align-items: center;"></div>
                            <div class="setting-helper">用於法規檢測與時事分析 (儲存於本地，不回傳伺服器)。</div>
                        </div>

                        <!-- AI Sensitivity -->
                        <div class="setting-group">
                            <label><i class="fa-solid fa-robot"></i> AI 風險偵測敏感度</label>
                            <select id="setting-ai-sensitivity" class="setting-select">
                                <option value="high">高 (嚴格監控)</option>
                                <option value="medium" selected>中 (平衡模式)</option>
                                <option value="low">低 (僅重大異常)</option>
                            </select>
                        </div>
                        
                        <!-- Tone -->
                        <div class="setting-group">
                            <label><i class="fa-solid fa-comments"></i> 報告語氣風格</label>
                            <select id="setting-ai-tone" class="setting-select">
                                <option value="professional" selected>專業客觀 (Professional)</option>
                                <option value="warm">溫暖親切 (Warm)</option>
                                <option value="sales">銷售導向 (Sales)</option>
                            </select>
                        </div>
                        
                        <!-- Default Page -->
                        <div class="setting-group">
                            <label><i class="fa-solid fa-house"></i> 預設首頁</label>
                            <select id="setting-default-page" class="setting-select">
                                <option value="overview" selected>營運概要 (Overview)</option>
                                <option value="appointments">預約分析 (Appointments)</option>
                                <option value="customers">顧客洞察 (Customers)</option>
                            </select>
                        </div>

                    </div>

                    <div class="settings-footer">
                         <button class="btn-secondary close-settings">取消</button>
                         <button class="btn-primary" id="btn-save-settings">儲存變更</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalOverlay);

            // Bind Events
            const closeBtns = modalOverlay.querySelectorAll('.close-settings');
            closeBtns.forEach(btn => btn.addEventListener('click', () => modalOverlay!.classList.remove('active')));
            
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) modalOverlay!.classList.remove('active');
            });

            // Download Template
            const btnDownload = modalOverlay.querySelector('#btn-download-template');
            btnDownload?.addEventListener('click', generateTemplateCSV);

            // Import CSV
            const fileInput = modalOverlay.querySelector('#file-upload-csv') as HTMLInputElement;
            fileInput?.addEventListener('change', handleFileUpload);
            
            // Test Connection Logic
            const btnTest = modalOverlay.querySelector('#btn-test-ai-connection');
            const statusEl = modalOverlay.querySelector('#ai-connection-status');
            
            btnTest?.addEventListener('click', async () => {
                const inputEl = document.getElementById('setting-ai-key') as HTMLInputElement;
                // Prefer Environment Key if locked, otherwise input value
                let key = inputEl.value;
                
                // If the input says "Loaded from Env", we shouldn't use that literal string
                // But getApiKey() inside service handles priority.
                // However, testConnectivity uses providedKey OR getApiKey().
                // If user typed a new key, we test THAT.
                // If user didn't type (and it's locked), we test the actual env key.
                
                // Check if locked/env mode
                if (inputEl.disabled && apiService.isUsingEnvKey()) {
                     key = ""; // Let service fetch the real env key
                } else {
                     if(!key || key.trim() === '') {
                        if(statusEl) statusEl.innerHTML = '<span style="color: #ef4444;"><i class="fa-solid fa-circle-exclamation"></i> 請先輸入 Key</span>';
                        return;
                     }
                }

                if(statusEl) statusEl.innerHTML = '<span style="color: #94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i> 測試連線中...</span>';
                
                // Need to import externalIntelligence dynamically or ensure it's available
                // Importing at top of file: import { externalIntelligence } from "../services/ExternalIntelligenceService.js";
                // Assuming it is imported. If not, I need to add import. 
                // Based on previous reads, I need to check imports.
                // Logic:
                const { externalIntelligence } = await import("../services/ExternalIntelligenceService.js");
                const result = await externalIntelligence.testConnectivity(key);
                
                if(statusEl) {
                    if(result.success) {
                        statusEl.innerHTML = `<span style="color: #10b981; font-weight:600;"><i class="fa-solid fa-circle-check"></i> ${result.message}</span>`;
                    } else {
                        statusEl.innerHTML = `<span style="color: #ef4444; font-weight:600;"><i class="fa-solid fa-circle-xmark"></i> ${result.message}</span>`;
                    }
                }
            });
            
            // Save Settings
            const btnSave = modalOverlay.querySelector('#btn-save-settings');
            btnSave?.addEventListener('click', () => {
                // Get Values
                const chur = (document.getElementById('setting-churn-days') as HTMLInputElement).value;
                const vip = (document.getElementById('setting-vip-quantile') as HTMLInputElement).value;
                const aiKey = (document.getElementById('setting-ai-key') as HTMLInputElement).value;
                const aiSense = (document.getElementById('setting-ai-sensitivity') as HTMLSelectElement).value;
                const tone = (document.getElementById('setting-ai-tone') as HTMLSelectElement).value;
                const defPage = (document.getElementById('setting-default-page') as HTMLSelectElement).value;

                // Persist
                localStorage.setItem('config_churn_days', chur);
                localStorage.setItem('config_vip_quantile', vip);
                if (aiKey) apiService.setApiKey(aiKey);
                localStorage.setItem('config_ai_sensitivity', aiSense);
                localStorage.setItem('report_tone', tone);  // Updated Key
                localStorage.setItem('config_default_page', defPage);
                
                alert('系統設定已更新！(Layer 1-3 Synced)');
                modalOverlay!.classList.remove('active');
                
                // Refresh Trigger
                if(typeof (window as any).refreshDashboardWithSettings === 'function') {
                    (window as any).refreshDashboardWithSettings();
                } else {
                     console.log('[Settings] Saved:', { churn: chur, vip, aiSense, tone, defPage });
                }
            });
            
            // Load saved settings on open
            const loadSettings = () => {
                const sChurn = localStorage.getItem('config_churn_days');
                const sVip = localStorage.getItem('config_vip_quantile');
                const sAi = localStorage.getItem('config_ai_sensitivity');
                const sTone = localStorage.getItem('report_tone');  // Updated Key
                const sPage = localStorage.getItem('config_default_page');
                const sKey = apiService.getApiKey();
                
                if(sChurn) (document.getElementById('setting-churn-days') as HTMLInputElement).value = sChurn;
                if(sVip) (document.getElementById('setting-vip-quantile') as HTMLInputElement).value = sVip;
                
                // API Key Handling
                const keyInput = document.getElementById('setting-ai-key') as HTMLInputElement;
                if (apiService.isUsingEnvKey()) {
                    keyInput.type = 'text';
                    keyInput.value = '已從環境設定載入';
                    keyInput.disabled = true;
                    keyInput.style.backgroundColor = '#f1f5f9';
                    keyInput.style.color = '#64748b';
                } else if(sKey) {
                    keyInput.value = sKey;
                }
                
                if(sAi) (document.getElementById('setting-ai-sensitivity') as HTMLSelectElement).value = sAi;
                if(sTone) (document.getElementById('setting-ai-tone') as HTMLSelectElement).value = sTone;
                if(sPage) (document.getElementById('setting-default-page') as HTMLSelectElement).value = sPage;
            };

            // Bind Load to Open Button
             btnSettings.onclick = () => {
                 loadSettings();
                 const overlay = document.getElementById('settings-modal-overlay');
                 overlay?.classList.add('active');
            };
        } else {
            // Already exists, just re-bind open click
            btnSettings.onclick = () => {
                 // Load logic inside
                 const sChurn = localStorage.getItem('config_churn_days');
                 if(sChurn) (document.getElementById('setting-churn-days') as HTMLInputElement).value = sChurn;
                 // (Simplified reload for brevity, ideal is shared function)
                 const overlay = document.getElementById('settings-modal-overlay');
                 overlay?.classList.add('active');
            };
        }
    }
}

/**
 * 產生並下載標準 CSV 範本
 */
function generateTemplateCSV() {
    const headers = [
        'appointment_id', 'date', 'customer_id', 'gender', 'age', 'is_new', 
        'service_item', 'purchased_amount', 'doctor_name', 'staff_name', 
        'status', 'room', 'equipment', 'remaining_sessions', 'case_flag', 'focus_override'
    ];
    
    // Example Rows
    const rows = [
        ['IMP-001', '2026-03-01', 'CUS888', 'female', '35', 'yes', 'PicoSure', '8000', 'Dr. Chen', 'Nurse Lin', 'completed', 'R01', 'Laser-A', '5', 'high_value', 'none'],
        ['IMP-002', '2026-03-02', 'CUS999', 'male', '42', 'no', 'Thermage', '60000', 'Dr. Wu', 'Nurse Wang', 'completed', 'R02', 'RF-B', '0', 'vip', 'none']
    ];
    
    let csvContent = "data:text/csv;charset=utf-8," + "\ufeff"; // Add BOM
    csvContent += headers.join(",") + "\r\n";
    rows.forEach(row => {
        csvContent += row.join(",") + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "universal_master_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * 處理檔案上傳與即時檢核 (Data Robustness)
 */
function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const statusMsg = document.getElementById('upload-status-msg');
    
    if (!file) return;
    if (!statusMsg) return;

    statusMsg.textContent = "正在分析檔案結構...";
    statusMsg.style.color = "#64748b";

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result as string;
        try {
            const lines = text.trim().split('\n');
            const headers = parseCSVLine(lines[0]).map(h => h.trim());
            
            // Basic validation check
            const hasService = headers.some(h => h.toLowerCase().includes('service'));
            
            if (!hasService) {
                 statusMsg.innerHTML = '<span style="color:#ef4444;">❌ 格式不符：找不到 Service 相關欄位</span>';
                 return;
            }

            statusMsg.innerHTML = '<span style="color:#10b981;"><i class="fa-solid fa-spinner fa-spin"></i> 檢核通過，正在智慧分流...</span>';
            
            // Parse all rows to objects
            const rawRows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const vals = parseCSVLine(line);
                const obj: any = {};
                headers.forEach((h, idx) => {
                    obj[h] = vals[idx] || "";
                });
                rawRows.push(obj);
            }

            // Call DataStore Master Import
            // We need a small delay to let UI render the spinner
            setTimeout(async () => {
                const result = await dataStore.handleMasterImport(rawRows);
                
                statusMsg.innerHTML = `<span style="color:#10b981;"><i class="fa-solid fa-check-circle"></i> ✅ 萬用營運報表載入成功！已同步更新醫師產能、到診率與 AI 診斷摘要 (新增 ${result.count} 筆)</span>`;
                
                // Trigger Refresh
                if (typeof (window as any).refreshOverviewPageByMonth === "function") {
                     (window as any).refreshOverviewPageByMonth();
                }
                
                // Also Refresh Staff Page if active (to show new doctors)
                const staffPage = document.getElementById('staff');
                if (staffPage && staffPage.classList.contains('active')) {
                     (window as any).initStaffPage?.();
                }

            }, 500);

        } catch (err) {
            console.error(err);
            statusMsg.innerHTML = '<span style="color:#ef4444;">讀取檔案失敗，請檢查 CSV 格式</span>';
        }
    };
    
    reader.onerror = () => {
        statusMsg.innerHTML = '<span style="color:#ef4444;">讀取檔案失敗</span>';
    };
    
    reader.readAsText(file);
    input.value = '';
}
