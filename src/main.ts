// === Mock Global Date for Demo (Locked to 2025-12-01) ===
console.log("[Main] Initializing Global Date Mock...");
const OriginalDate = globalThis.Date;
const FIXED_TIME = new OriginalDate('2025-12-01T00:00:00+08:00').getTime();

// @ts-ignore
globalThis.Date = new Proxy(OriginalDate, {
    construct(target, args) {
        if (args.length === 0) {
            return new target(FIXED_TIME);
        }
        // @ts-ignore
        return new target(...args);
    },
    apply(target, thisArg, args) {
        // Native Date() call as function ignores arguments and returns current time string
        if (args.length === 0) {
            return new target(FIXED_TIME).toString();
        }
        return Reflect.apply(target, thisArg, args);
    }
});

// @ts-ignore
globalThis.Date.now = () => FIXED_TIME;
globalThis.Date.parse = OriginalDate.parse;
globalThis.Date.UTC = OriginalDate.UTC;
// Proxy inherits prototype from OriginalDate via the constructor trap results

// === Import Styles (Unified) ===
import "../style.css";
import "../style_global_interactive.css";
import "../style_kpi_compact.css";
import "../style_customer_insights.css";
import "./styles/workload-cards.css";
import "./styles/launchCover.css";
import "./styles/admin.css";
import "./styles/dashboard.css"; // formerly sandbox.css

// === Import 區 ===
import { initPanelController, bindModalEvents } from "./ui/panelController.js";
import { initPageController } from "./ui/pageController.js";
import { dataStore } from "./data/dataStore.js";
import { ModalManager } from "./ui/ModalManager.js";
import { initServicesPage } from "./pages/servicesPage.js";
import { initOverviewPage } from "./pages/overviewPage.js";
import { initRoomsPage } from "./pages/roomsPage.js";
import { initAppointmentsPage } from "./pages/appointmentsPage.js";
import { initStaffPage } from "./pages/staffPage.js";
import { initCustomersPage } from "./pages/customersPage.js";
import { initLaunchCover } from "./pages/launchCoverPage.js";
import { initTasksPage } from "./pages/tasksPage.js";
import { openChurnRiskViewGlobal } from "./pages/customersPage.js";
import { initAdminPage } from "./pages/adminPage.js";
import { initSchedulingSimulatorPage } from "./pages/schedulingSimulatorPage.js";
import { SystemHealthEvaluator } from "./logic/systemHealthEvaluator.js";

// CSS
import "./styles/scheduler.css";

// === 全域註冊頁面初始化（給 pageController 使用）===
(window as any).initOverviewPage = initOverviewPage;
(window as any).initServicesPage = initServicesPage;
(window as any).initRoomsPage = initRoomsPage;
(window as any).initAppointmentsPage = initAppointmentsPage;
(window as any).initStaffPage = initStaffPage;
(window as any).initCustomersPage = initCustomersPage;
(window as any).initLaunchCover = initLaunchCover;
(window as any).initTasksPage = initTasksPage;
(window as any).initAdminPage = initAdminPage;
(window as any).initSchedulingSimulatorPage = initSchedulingSimulatorPage;

// === Global Event Delegation for Modals ===
document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('.js-open-modal');
    if (target) {
        // Prevent default if it's a link
        if ((target as HTMLElement).tagName === 'A') {
            e.preventDefault();
        }

        const modalId = target.getAttribute('data-modal');
        const modalTitle = target.getAttribute('data-title') || '詳細資訊';
        
        console.log(`[Global Click] Opening Modal: ${modalId}`);

        // Handle Specific Modals
        if (modalId === 'customer-modal') {
             // For "Risk Customers", we usually use openChurnRiskViewGlobal
             openChurnRiskViewGlobal();
             return;
        }

        // Try Overview Page specific modals (Global Delegation)
        if ((window as any).handleOverviewModal && (window as any).handleOverviewModal(modalId)) {
            return;
        }

        // Generic Fallback
        ModalManager.open(modalTitle, '<div class="p-8 text-center text-gray-500">功能開發中<br><small>此彈窗內容尚未串接</small></div>');
    }
});

// === DOM Ready：所有初始化集中在這裡 ===
window.addEventListener("DOMContentLoaded", async () => {
    console.log("App Loaded.");

    // 0. 優先初始化啟動封面頁
    await initLaunchCover();

    ModalManager.init();   // 👈 初始化 ModalManager

    // 1. UI 控制器
    initPanelController();

    // 2. 綁定所有彈窗事件（左上角關閉 ×、背景點擊）
    bindModalEvents();

    // 3. 全站月份下拉選單 (Populate First)
    setupGlobalMonthSelector();

    // 4. 啟動頁面控制 (Bind Second)
    initPageController();
});

// === 月份選單 ===
function setupGlobalMonthSelector() {
    const monthSelector = document.getElementById("global-month-selector") as HTMLSelectElement | null;
    if (!monthSelector) return;

    // 定義更新邏輯
    const refreshOptions = () => {
        // Fallback: If no data, use Current Month
        let months = Array.from(
            new Set(dataStore.appointments.map(a => a.date.slice(0, 7)))
        ).sort();

        const currentMonth = new Date().toISOString().slice(0, 7);
        
        if (months.length === 0) {
            months = [currentMonth];
        }

        // 預設為當前月份（YYYY-MM）
        // 若當前月份不在列表中，預設選最後一個 (最新的)
        if (!window.currentDashboardMonth) {
             window.currentDashboardMonth = months.includes(currentMonth) ? currentMonth : months[months.length - 1];
        }

        monthSelector.innerHTML = months
            .map(m => `<option value="${m}" ${m === window.currentDashboardMonth ? "selected" : ""}>${m}</option>`)
            .join("");
            
        // Sync value
        monthSelector.value = window.currentDashboardMonth || currentMonth;
    };

    // Initial Run
    refreshOptions();

    // 暴露給外部 (當 Appointments 載入完成後呼叫)
    (window as any).updateMonthSelector = refreshOptions;
}

declare global {
    interface Window {
        currentDashboardMonth?: string;
        initServicesPage?: () => void;
        initRoomsPage?: () => void;
        initOverviewPage?: () => void;
        initAppointmentsPage?: () => void;
        initStaffPage?: () => void;
        initCustomersPage?: () => void;
        initLaunchCover?: () => void;
        initAdminPage?: () => void;
        updateSystemHealthStatus?: () => void;
    }
}

// === System Health Status ===
// === System Health Status ===
function setupSystemHealthStatus() {
    const report = dataStore.validationReport;
    if (!report) return;

    const status = SystemHealthEvaluator.evaluate(report);
    
    // Elements
    const card = document.getElementById("system-status-card");
    const badge = document.getElementById("sys-status-badge");
    const mainText = document.getElementById("sys-status-main");
    const subText = document.getElementById("sys-status-sub");

    if (card && badge && mainText && subText) {
        // 0. Update Label (Semantics: Data Quality)
        const label = card.querySelector('.label');
        if (label) label.textContent = '資料品質狀態';

        // 1. Source Label
        const isApi = !!report.meta.mode;
        const sourceLabel = isApi ? `API` : "CSV";
        
        // 2. Badge (Business Friendly)
        const levelTextMap: Record<string, string> = { 'normal': '良好', 'warning': '需留意', 'critical': '風控中' };
        const iconMap: Record<string, string> = { 'normal': '🟢', 'warning': '🟡', 'critical': '🔴' };
        
        badge.className = "status-badge " + status.level; 
        badge.textContent = `${iconMap[status.level]} ${levelTextMap[status.level]}`;
        
        // 3. Main Text (User Friendly Message)
        mainText.textContent = status.message;
        
        // 4. Sub Text (Details + Quarantine Risk Control)
        const timeStr = report.timestamp ? new Date(report.timestamp).toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
        const qCount = report.meta.quarantineCount;
        
        subText.innerHTML = `
            <div style="font-size: 0.8rem; opacity: 0.7; margin-bottom: 3px;">
                ${sourceLabel} • ${timeStr}
            </div>
            <div style="${qCount > 0 ? 'color: #fbbf24; font-weight: 500;' : 'opacity: 0.8;'}">
                🛡 已隔離: ${qCount} 筆
            </div>
        `;
        
        // Tooltip for full description (Explanation)
        card.title = status.description;

        card.onclick = () => {
             const adminTab = document.querySelector('[data-tab="admin"]') as HTMLElement;
             if (adminTab) adminTab.click();
        };

        card.style.display = 'block';
    }
}

// Expose to window for calling after data load
(window as any).dataStore = dataStore;
(window as any).updateSystemHealthStatus = setupSystemHealthStatus;

