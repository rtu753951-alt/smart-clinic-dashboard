import { sandboxStore, SandboxState } from "./sandboxStore.js";
import { dataStore } from "../../data/dataStore.js";
import { renderStaffWorkloadChart } from "../../logic/staff/staffWorkloadChart.js";

/**
 * Sandbox Control Panel
 * 懸浮控制視窗
 */
export class SandboxControlPanel {
    private container: HTMLElement | null = null;
    private isMinimized = false;

    init() {
        if (document.getElementById('sandbox-panel')) return;

        // Create Container
        this.container = document.createElement('div');
        this.container.id = 'sandbox-panel';
        this.container.className = 'sandbox-panel';
        this.container.innerHTML = this.getHTML();
        
        document.body.appendChild(this.container);

        // Bind Events
        this.bindEvents();
        
        // Initial State Render
        this.updateUIFromStore();

        // Drag Functionality
        this.enableDrag(document.getElementById('sandbox-header') as HTMLElement);
    }

    destroy() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }

    private getHTML() {
        return `
            <div id="sandbox-header" class="sandbox-header">
                <div class="sandbox-title">
                    <i class="fa-solid fa-flask"></i> 情境模擬器 (Sandbox)
                </div>
                <div class="sandbox-controls">
                    <button id="btn-sandbox-minimize" class="icon-btn"><i class="fa-solid fa-minus"></i></button>
                    <button id="btn-sandbox-close" class="icon-btn"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            
            <div id="sandbox-body" class="sandbox-body">
                <!-- Section 1: Staff Adjustment -->
                <div class="sandbox-section">
                    <h4><i class="fa-solid fa-user-group"></i> 人力增減 (Staff Delta)</h4>
                    
                    ${this.renderStaffSlider('doctor', '醫師', 'Doctor')}
                    ${this.renderStaffSlider('nurse', '護理師', 'Nurse')}
                    ${this.renderStaffSlider('therapist', '美療師', 'Therapist')}
                    ${this.renderStaffSlider('consultant', '諮詢師', 'Consultant')}
                </div>

                <!-- Section 2: Demand Growth -->
                <div class="sandbox-section">
                    <h4><i class="fa-solid fa-arrow-trend-up"></i> 療程需求預估 (Growth %)</h4>
                    
                    ${this.renderGrowthSlider('inject', '微整注射 (Inject)')}
                    ${this.renderGrowthSlider('rf', '電音波 (RF)')}
                    ${this.renderGrowthSlider('laser', '雷射光療 (Laser)')}
                    ${this.renderGrowthSlider('drip', '點滴保養 (Drip)')}
                    ${this.renderGrowthSlider('consult', '現場諮詢 (Consult)')}
                </div>

                <div class="sandbox-footer">
                    <button id="btn-sandbox-reset" class="sandbox-reset-btn">
                        <i class="fa-solid fa-rotate-left"></i> 重置參數
                    </button>
                </div>
            </div>
            
            <div id="sandbox-minimized-view" class="sandbox-minimized-view" style="display: none;">
                <span class="pulse-dot"></span> 模擬中
                <button id="btn-sandbox-restore" class="icon-btn-small"><i class="fa-solid fa-expand"></i></button>
            </div>
        `;
    }

    private renderStaffSlider(role: string, label: string, eng: string) {
        // Calculate current active staff count
        const count = dataStore.staff.filter(s => s.staff_type === role && s.status === 'active').length;
        // Limit: Cannot reduce more than (count - 1), so at least 1 remains.
        const minVal = -Math.max(0, count - 1);

        return `
            <div class="control-row">
                <div class="control-label">
                    <span>${label} <span style="font-size:0.8em; color:#64748b;">(現有: ${count})</span></span>
                    <span id="val-staff-${role}" class="control-value">0</span>
                </div>
                <input type="range" id="slider-staff-${role}" data-role="${role}" 
                    min="${minVal}" max="5" step="1" value="0" class="sandbox-slider staff-slider">
            </div>
        `;
    }

    private renderGrowthSlider(category: string, label: string) {
        return `
            <div class="control-row">
                <div class="control-label">
                    <span>${label}</span>
                    <span id="val-growth-${category}" class="control-value">0%</span>
                </div>
                <input type="range" id="slider-growth-${category}" data-category="${category}" 
                    min="-50" max="100" step="5" value="0" class="sandbox-slider growth-slider">
            </div>
        `;
    }

    private bindEvents() {
        const store = sandboxStore;

        // Sliders: Staff
        this.container?.querySelectorAll('.staff-slider').forEach(el => {
            el.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                const role = target.dataset.role as keyof SandboxState['staffDeltas'];
                const val = parseInt(target.value, 10);
                
                // Update UI Value
                const valDisplay = document.getElementById(`val-staff-${role}`);
                if (valDisplay) valDisplay.innerText = val > 0 ? `+${val}` : `${val}`;
                
                // Update Store
                store.setStaffDelta(role, val);
            });
        });

        // Sliders: Growth
        this.container?.querySelectorAll('.growth-slider').forEach(el => {
            el.addEventListener('input', (e) => {
                const target = e.target as HTMLInputElement;
                const cat = target.dataset.category as keyof SandboxState['serviceGrowth'];
                const val = parseInt(target.value, 10);
                
                // Update UI Value
                const valDisplay = document.getElementById(`val-growth-${cat}`);
                if (valDisplay) valDisplay.innerText = val > 0 ? `+${val}%` : `${val}%`;
                
                // Update Store (Convert % to decimal logic handles elsewhere or here? Store expects 0.2? Plan said 0.2)
                // Let's store as rate (0.2)
                store.setServiceGrowth(cat, val / 100);
            });
        });

        // Reset
        document.getElementById('btn-sandbox-reset')?.addEventListener('click', () => {
            store.resetSimulation();
        });

        // Close
        // Close
        document.getElementById('btn-sandbox-close')?.addEventListener('click', () => {
             // Confirm Modal Logic
             if (confirm("確定結束 Sandbox 模式？所有模擬數據將還原。")) {
                 store.deactivateSandbox();
                 const toggleBtn = document.getElementById('toggle-sandbox');
                 if (toggleBtn) {
                     toggleBtn.classList.remove('active');
                     toggleBtn.style.background = ''; // Clear inline style
                 }
                 this.destroy(); // Remove panel from DOM
             }
        });

        // Minimize / Restore
        document.getElementById('btn-sandbox-minimize')?.addEventListener('click', () => {
             this.toggleMinimize(true);
        });
        document.getElementById('btn-sandbox-restore')?.addEventListener('click', () => {
             this.toggleMinimize(false);
        });

        // Subscribe to Store Changes to sync UI (e.g. on Reset)
        store.subscribe((state) => {
            // Update Staff Sliders
            Object.entries(state.staffDeltas).forEach(([role, val]) => {
                const input = document.getElementById(`slider-staff-${role}`) as HTMLInputElement;
                const display = document.getElementById(`val-staff-${role}`);
                if (input && display) {
                    input.value = String(val);
                    display.innerText = val > 0 ? `+${val}` : `${val}`;
                }
            });

            // Update Growth Sliders
            Object.entries(state.serviceGrowth).forEach(([cat, rate]) => {
                const percent = Math.round(rate * 100);
                const input = document.getElementById(`slider-growth-${cat}`) as HTMLInputElement;
                const display = document.getElementById(`val-growth-${cat}`);
                if (input && display) {
                    input.value = String(percent);
                    display.innerText = percent > 0 ? `+${percent}%` : `${percent}%`;
                }
            });
            
            // Trigger Global Alert Bar Update?
            this.updateGlobalAlert(state.isActive);
        });
    }
    
    // Initial UI Sync (in case re-opening with existing state)
    private updateUIFromStore() {
        const state = sandboxStore.getState();
        // Sliders sync is handled by subscribe usually, but trigger once?
        // Actually subscribe is for FUTURE changes.
        // Let's manually trigger the update logic once or just rely on the inputs default 0 if fresh.
        // If state persists, we need to sync.
        
        // ... Repeated logic from subscribe ...
        Object.entries(state.staffDeltas).forEach(([role, val]) => {
            const input = document.getElementById(`slider-staff-${role}`) as HTMLInputElement;
            const display = document.getElementById(`val-staff-${role}`);
            if (input && display) {
                input.value = String(val);
                display.innerText = val > 0 ? `+${val}` : `${val}`;
            }
        }); 
        // ... (Growth similiar) ...
    }

    private toggleMinimize(min: boolean) {
        this.isMinimized = min;
        const body = document.getElementById('sandbox-body');
        const minView = document.getElementById('sandbox-minimized-view');
        
        if (min) {
            if(body) body.style.display = 'none';
            if(minView) minView.style.display = 'flex';
            this.container?.classList.add('minimized');
        } else {
            if(body) body.style.display = 'block';
            if(minView) minView.style.display = 'none';
            this.container?.classList.remove('minimized');
        }
    }

    private updateGlobalAlert(isActive: boolean) {
        let alertBar = document.getElementById('sandbox-global-alert');
        if (isActive) {
            if (!alertBar) {
                alertBar = document.createElement('div');
                alertBar.id = 'sandbox-global-alert';
                alertBar.innerHTML = '⚠️ <strong>模擬模式運行中</strong> - 您看到的數據為情境推演結果，非真實營運數據。';
                document.body.prepend(alertBar); // Add to top
            }
        } else {
            if (alertBar) alertBar.remove();
        }
    }

    private enableDrag(handle: HTMLElement) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const elmnt = this.container;
        if (!elmnt) return;

        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e: MouseEvent) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e: MouseEvent) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            elmnt!.style.top = (elmnt!.offsetTop - pos2) + "px";
            elmnt!.style.left = (elmnt!.offsetLeft - pos1) + "px";
            elmnt!.style.bottom = 'auto'; // Disable default bottom positioning once dragged
            elmnt!.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
}
