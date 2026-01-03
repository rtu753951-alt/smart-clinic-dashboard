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

// === 全域註冊頁面初始化（給 pageController 使用）===
(window as any).initOverviewPage = initOverviewPage;
(window as any).initServicesPage = initServicesPage;
(window as any).initRoomsPage = initRoomsPage;
(window as any).initAppointmentsPage = initAppointmentsPage;
(window as any).initStaffPage = initStaffPage;
(window as any).initCustomersPage = initCustomersPage;
(window as any).initTasksPage = initTasksPage;

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

    const months = Array.from(
        new Set(dataStore.appointments.map(a => a.date.slice(0, 7)))
    ).sort();

    // 預設為當前月份（YYYY-MM）
    const currentMonth = new Date().toISOString().slice(0, 7);
    window.currentDashboardMonth = months.includes(currentMonth) ? currentMonth : months[months.length - 1];

    monthSelector.innerHTML = months
        .map(m => `<option value="${m}" ${m === window.currentDashboardMonth ? "selected" : ""}>${m}</option>`)
        .join("");

    // 初始設置 window.currentDashboardMonth
    if (monthSelector.value) {
        window.currentDashboardMonth = monthSelector.value;
    }

    // Event Listener 移至 pageController.ts 統一管理，避免重複觸發
    // monthSelector.addEventListener("change", () => { ... });
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
    }
}
