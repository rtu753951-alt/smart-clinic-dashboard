// === Import Styles (Unified) ===
import "../style.css";
import "../style_global_interactive.css";
import "../style_kpi_compact.css";
import "../style_customer_insights.css";
import "./styles/workload-cards.css";
import "./styles/launchCover.css";
import "./styles/admin.css";

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
import { SystemHealthEvaluator } from "./logic/systemHealthEvaluator.js";



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
    
    // New Card Elements
    const card = document.getElementById("system-status-card");
    const badge = document.getElementById("sys-status-badge");
    const mainText = document.getElementById("sys-status-main");
    const subText = document.getElementById("sys-status-sub");

    if (card && badge && mainText && subText) {
        // Update Content
        badge.className = "status-badge " + status.level; // e.g. status-badge normal
        badge.textContent = status.level === 'normal' ? '🟢 穩定' : 
                            (status.level === 'warning' ? '⚠️ 注意' : '🔴 需處理');
        
        mainText.textContent = status.message;
        subText.textContent = status.description;

        // Card Click Handler (Always active for detail view)
        card.onclick = () => {
             const adminTab = document.querySelector('[data-tab="admin"]') as HTMLElement;
             if (adminTab) adminTab.click();
        };

        // Ensure visible if hidden (optional)
        card.style.display = 'block';
    }
}

// Expose to window for calling after data load
(window as any).updateSystemHealthStatus = setupSystemHealthStatus;

