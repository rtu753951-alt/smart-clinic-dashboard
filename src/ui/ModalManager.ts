// src/ui/ModalManager.ts

export class ModalManager {
    private static modal: HTMLElement | null = null;
    private static titleBox: HTMLElement | null = null;
    private static bodyBox: HTMLElement | null = null;
    private static dialog: HTMLElement | null = null;

    /** 初始化（在 main.ts 內 DOMContentLoaded 時呼叫一次） */
    static init() {
        this.modal = document.getElementById("dashboard-modal");
        if (!this.modal) {
            console.error("[ModalManager] 找不到 #dashboard-modal");
            return;
        }

        this.titleBox = document.getElementById("modal-title");
        this.bodyBox = document.getElementById("modal-body");
        this.dialog = this.modal.querySelector(".modal-dialog");

        const closeBtn = this.modal.querySelector(".modal-close");

        // 點 X 關閉
        closeBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            ModalManager.close();
        });

        // 點背景關閉
        this.modal.addEventListener("click", () => ModalManager.close());

        // 點 dialog 內容不關閉
        this.dialog?.addEventListener("click", (e) => e.stopPropagation());
    }

    /** 開啟彈窗（支援自定義寬度，如 max-w-4xl） */
    static open(title: string, contentHTML: string, widthClass: string = "max-w-2xl") {
        if (!this.modal || !this.titleBox || !this.bodyBox || !this.dialog) return;

        // Reset classes and apply width
        this.dialog.className = "modal-dialog";
        if (widthClass) {
            this.dialog.classList.add(widthClass);
        }

        this.titleBox.textContent = title;
        this.bodyBox.innerHTML = contentHTML;

        this.modal.hidden = false;
        this.modal.classList.add("show");
    }

    /** 顯示載入中狀態 */
    static loading() {
        this.open("載入中...", `
            <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--accent-color); margin-bottom: 12px;"></i>
                <div>資料分析運算中...</div>
            </div>
        `, "max-w-md");
    }

    /** 關閉彈窗 */
    static close() {
        if (!this.modal) return;

        this.modal.classList.remove("show");

        // 等動畫 150ms 再隱藏
        setTimeout(() => {
            this.modal!.hidden = true;
        }, 150);
    }
}
