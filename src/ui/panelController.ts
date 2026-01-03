export function initPanelController() {
  console.log("PanelController: Legacy panels disabled.");
}

/* 
function togglePanel(...) { ... }
...
*/

/*
  document.addEventListener("click", (e) => {
    const target = e.target as Node;

    if (
      !notificationPanel.contains(target) &&
      !settingsPanel.contains(target) &&
      !btnNotif.contains(target) &&
      !btnSettings.contains(target)
    ) {
      closePanels(notificationPanel, settingsPanel);
    }
  });
}

function togglePanel(
  type: "notif" | "settings",
  notif: HTMLElement,
  settings: HTMLElement
) {
  if (type === "notif") {
    notif.classList.toggle("open");
    settings.classList.remove("open");
  } else {
    settings.classList.toggle("open");
    notif.classList.remove("open");
  }
}

function closePanels(notif: HTMLElement, settings: HTMLElement) {
  notif.classList.remove("open");
  settings.classList.remove("open");
}
*/
export function bindModalEvents() {
    const modal = document.getElementById("dashboard-modal");
    if (!modal) return;

    const closeBtn = modal.querySelector(".modal-close");

    // 1️⃣ 點 X 關閉
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            modal.hidden = true;       // ← 用 hidden 才符合你現在的 HTML
        });
    }

    // 2️⃣ 點背景關閉
    modal.addEventListener("click", () => {
        modal.hidden = true;
    });

    // 3️⃣ 點 modal-dialog 時不要關閉
    const dialog = modal.querySelector(".modal-dialog");
    if (dialog) {
        dialog.addEventListener("click", e => e.stopPropagation());
    }
}
