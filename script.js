/* ================================================
   Global State
================================================ */
let currentPage = "overview";
const panels = {
  notif: false,
  settings: false
};

/* ================================================
   PAGE SWITCH (Sidebar → 切換子分頁)
================================================ */
document.querySelectorAll(".nav-links li").forEach((nav) => {
  nav.addEventListener("click", () => {
    const page = nav.dataset.tab;
    switchPage(page);

    // Sidebar active 狀態
    document.querySelectorAll(".nav-links li").forEach((li) =>
      li.classList.remove("active")
    );
    nav.classList.add("active");
  });
});

function switchPage(page) {
  currentPage = page;

  // 切換 section 顯示
  document.querySelectorAll(".page-section").forEach((sec) => {
    sec.classList.remove("active");
  });
  document.getElementById(page).classList.add("active");

  // 更新 top bar title
  const chineseNames = {
    overview: "營運概要",
    appointments: "預約分析",
    staff: "人力分析",
    rooms: "診間設備",
    services: "療程營收",
    customers: "顧客洞察"
  };
  document.getElementById("pageTitle").textContent =
    chineseNames[page] + " " + capitalize(page);

  // 若此 page 有 data-init，就呼叫 init function
  const initFnName = "init" + capitalize(page) + "Page";
  if (typeof window[initFnName] === "function") {
    window[initFnName]();
  }

  // 切頁時自動關閉右側 panel（避免衝突）
  closeAllPanels();
}

/* 工具：字首大寫 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ================================================
   RIGHT PANEL TOGGLE (Bell / Gear) — 互斥模式
================================================ */

// 元件抓取
const btnNotif = document.getElementById("btnNotif");
const btnSettings = document.getElementById("btnSettings");
const notificationPanel = document.getElementById("notificationPanel");
const settingsPanel = document.getElementById("settingsPanel");

btnNotif.addEventListener("click", () => togglePanel("notif"));
btnSettings.addEventListener("click", () => togglePanel("settings"));

function togglePanel(type) {
  if (type === "notif") {
    notificationPanel.classList.toggle("open");
    settingsPanel.classList.remove("open");
  } else {
    settingsPanel.classList.toggle("open");
    notificationPanel.classList.remove("open");
  }
}

/* 點擊外側自動關閉 */
document.addEventListener("click", (e) => {
  const isInside =
    notificationPanel.contains(e.target) ||
    settingsPanel.contains(e.target) ||
    btnNotif.contains(e.target) ||
    btnSettings.contains(e.target);

  if (!isInside) {
    notificationPanel.classList.remove("open");
    settingsPanel.classList.remove("open");
  }
});


function applyPanelState() {
  // 通知面板
  if (panels.notif) {
    notificationPanel.classList.add("open");
    btnNotif.classList.add("active");
  } else {
    notificationPanel.classList.remove("open");
    btnNotif.classList.remove("active");
  }

  // 設定面板
  if (panels.settings) {
    settingsPanel.classList.add("open");
    btnSettings.classList.add("active");
  } else {
    settingsPanel.classList.remove("open");
    btnSettings.classList.remove("active");
  }
}

/* 關閉所有 Panel（換頁時會觸發） */
function closeAllPanels() {
  panels.notif = false;
  panels.settings = false;
  applyPanelState();
}

/* ================================================
   Optional: 點擊右側 panel 外側關閉
================================================ */
document.addEventListener("click", (e) => {
  const isPanel =
    notificationPanel.contains(e.target) ||
    settingsPanel.contains(e.target) ||
    btnNotif.contains(e.target) ||
    btnSettings.contains(e.target);

  if (!isPanel) {
    closeAllPanels();
  }
});

/* ================================================
   PAGE INIT HOOKS（你之後可填入個別分頁邏輯）
================================================ */

function initOverviewPage() {
  console.log("Overview loaded.");
}

function initAppointmentsPage() {
  console.log("Appointments loaded.");
}

function initStaffPage() {
  console.log("Staff page loaded.");
}

function initRoomsPage() {
  console.log("Rooms page loaded.");
}

function initServicesPage() {
  console.log("Services page loaded.");
}

function initCustomersPage() {
  console.log("Customers loaded.");
}

/* ================================================
   PAGE LOAD
================================================ */
window.addEventListener("DOMContentLoaded", () => {
  switchPage("overview");
});
