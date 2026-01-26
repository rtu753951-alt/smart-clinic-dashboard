
// src/pages/schedulingSimulatorPage.ts
import { dataStore } from "../data/dataStore.js";
import { SchedulerEngine } from "../features/scheduler/SchedulerEngine.js";
import { SchedulerConfig, SimulationResult, DailySchedule, ShiftType, StaffAssignment } from "../features/scheduler/types.js";

let currentResult: SimulationResult | null = null;
let engine: SchedulerEngine | null = null;

export function initSchedulingSimulatorPage() {
    console.log("initSchedulingSimulatorPage: Called.");
    const container = document.getElementById("scheduler-content");
    if (!container) return; // Should log error technically

    const hasRendered = container.querySelector('.scheduler-container');
    if (!hasRendered) {
        renderInterface(container);
        bindEvents();
    }
}

function renderInterface(container: HTMLElement) {
    container.innerHTML = `
        <div class="scheduler-container">
            <!-- Sidebar -->
            <aside class="scheduler-sidebar">
                <div class="control-section">
                    <div class="control-section-header">
                        <span><i class="fa-solid fa-sliders"></i> 基本設定</span>
                    </div>
                    <div class="sched-input-group">
                        <label>起始日期 (Start Date)</label>
                        <input type="date" id="sched-start-date" class="sched-input" value="2026-01-19">
                    </div>
                    <div class="sched-input-group">
                        <label>模擬區間 (Duration)</label>
                        <select id="sched-days" class="sched-select">
                            <option value="7" selected>7 天 (One Week)</option>
                            <option value="14">14 天 (Two Weeks)</option>
                        </select>
                    </div>
                </div>

                <div class="control-section" id="section-rules">
                    <div class="control-section-header" id="header-rules" style="cursor:pointer; justify-content:space-between;">
                        <span><i class="fa-solid fa-gavel"></i> 規則限制</span>
                        <i class="fa-solid fa-chevron-down" id="icon-rules" style="transition:transform 0.2s;"></i>
                    </div>
                    
                    <div id="rules-content" style="transition:all 0.3s ease-in-out; overflow:hidden;">
                        <!-- Toggle Content Omitted for Brevity (Same as before) -->
                        <label class="sched-toggle">
                            <input type="checkbox" id="rule-affinity" checked hidden>
                            <div class="toggle-track"><div class="toggle-knob"></div></div>
                            <span class="toggle-label">熟悉度優先</span>
                        </label>
                        
                        <label class="sched-toggle">
                            <input type="checkbox" id="rule-monopoly" checked hidden>
                            <div class="toggle-track"><div class="toggle-knob"></div></div>
                            <span class="toggle-label">去壟斷機制</span>
                        </label>

                        <div class="baseline-group" style="margin-bottom: 20px; background: rgba(0,0,0,0.03); padding: 12px; border-radius: 8px; border: 1px solid var(--sched-border);">
                            <label class="sched-toggle" style="margin-bottom:12px; justify-content: flex-start; gap: 12px;">
                                <input type="checkbox" id="rule-baseline" checked hidden>
                                <div class="toggle-track" style="flex-shrink:0;"><div class="toggle-knob"></div></div>
                                <span class="toggle-label" style="font-weight:600; color:var(--sched-primary);">啟用最低值班 (Baseline)</span>
                            </label>
                            
                            <div id="baseline-inputs" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:0.85rem;">
                                 <div>
                                    <label>醫師 (Doc)</label>
                                    <input type="number" id="base-doctor" value="0" min="0" class="sched-input" style="padding:4px;">
                                 </div>
                                 <div>
                                    <label>護理 (Nurse)</label>
                                    <input type="number" id="base-nurse" value="1" min="0" class="sched-input" style="padding:4px;">
                                 </div>
                                 <div>
                                    <label>美療 (Therapist)</label>
                                    <input type="number" id="base-therapist" value="0" min="0" class="sched-input" style="padding:4px;">
                                 </div>
                                 <div>
                                    <label>諮詢 (Consultant)</label>
                                    <input type="number" id="base-consultant" value="0" min="0" class="sched-input" style="padding:4px;">
                                 </div>
                                 <div>
                                    <label>行政 (Admin)</label>
                                    <input type="number" id="base-admin" value="1" min="0" class="sched-input" style="padding:4px;">
                                 </div>
                            </div>
                        </div>

                        <label class="sched-toggle">
                            <input type="checkbox" id="rule-workload" checked hidden>
                            <div class="toggle-track"><div class="toggle-knob"></div></div>
                            <span class="toggle-label">工時上限防護</span>
                        </label>
                    </div>
                </div>

                <!-- Scenario Section -->
                <div class="control-section">
                    <div class="control-section-header">
                        <span><i class="fa-solid fa-user-injured"></i> 情境事件 (Scenario)</span>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="display:block; font-size:0.8rem; color:#64748b; margin-bottom:4px;">請假員工 (Staff Leave)</label>
                        <select id="scenario-staff" class="sched-select" style="width:100%;">
                            <option value="">-- 請選擇員工 --</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">
                        <div>
                            <label style="display:block; font-size:0.8rem; color:#64748b; margin-bottom:4px;">日期 (Date)</label>
                            <select id="scenario-date" class="sched-select" style="width:100%;">
                                <option value="">--</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; color:#64748b; margin-bottom:4px;">班次 (Shift)</label>
                            <select id="scenario-shift" class="sched-select" style="width:100%;">
                                <option value="AM">AM</option>
                                <option value="PM">PM</option>
                            </select>
                        </div>
                    </div>
                    <button id="btn-scenario-analyze" class="btn-run-sim" style="background:var(--sched-text-secondary); margin-top:8px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> AI 推薦替補
                    </button>
                    <div id="scenario-result-area" style="margin-top:12px; font-size:0.85rem;"></div>
                </div>

                <button id="btn-run-simulation" class="btn-run-sim">
                    <i class="fa-solid fa-bolt"></i> 執行模擬運算
                </button>
            </aside>

            <!-- Main Content -->
            <main class="scheduler-main">
                <!-- KPI Cards -->
                <div class="sched-kpi-grid">
                    <div class="sched-kpi-card kpi-coverage">
                        <div class="kpi-icon"><i class="fa-solid fa-check-double"></i></div>
                        <div class="kpi-data">
                            <span class="kpi-value" id="metric-coverage">--%</span>
                            <span class="kpi-label">需求覆蓋率</span>
                        </div>
                    </div>
                    
                    <div class="sched-kpi-card kpi-risk">
                        <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <div class="kpi-data">
                            <span class="kpi-value" id="metric-overwork">0</span>
                            <span class="kpi-label">超工時警示</span>
                        </div>
                    </div>

                    <div class="sched-kpi-card kpi-affinity">
                        <div class="kpi-icon"><i class="fa-solid fa-handshake"></i></div>
                        <div class="kpi-data">
                            <span class="kpi-value" id="metric-affinity">--</span>
                            <span class="kpi-label">熟悉度評分</span>
                        </div>
                    </div>

                    <div class="sched-kpi-card kpi-hours">
                        <div class="kpi-icon"><i class="fa-solid fa-clock"></i></div>
                        <div class="kpi-data">
                            <span class="kpi-value" id="metric-hours">--</span>
                            <span class="kpi-label">總排班時數</span>
                        </div>
                    </div>
                </div>

                <!-- Schedule Grid -->
                <div class="sched-table-container">
                    <div id="schedule-target">
                        <div style="text-align:center; padding-top:100px; color:#64748b;">
                            <i class="fa-solid fa-calendar-alt" style="font-size:3rem; margin-bottom:16px;"></i>
                            <p>設定參數後，點擊「執行模擬運算」開始</p>
                        </div>
                    </div>
                </div>
            </main>

            <!-- Floating Log Toggle -->
            <button id="sched-log-toggle" class="log-toggle-btn">
                <i class="fa-solid fa-terminal"></i> 顯示系統日誌
            </button>

            <!-- Log Drawer -->
            <div id="sched-log-drawer" class="log-drawer">
                <div class="log-header" id="sched-log-close">
                   <span><i class="fa-solid fa-code"></i> 運算日誌 (Simulation Logs)</span>
                   <i class="fa-solid fa-chevron-down"></i>
                </div>
                <div id="sim-log-content" class="log-content"></div>
            </div>

            <!-- Details Sidebar (Right) -->
            <div id="sched-details-drawer" class="details-drawer">
                <button class="details-close" id="details-close-btn">&times;</button>
                <div id="details-content"></div>
            </div>
        </div>
    `;
}

function bindEvents() {
    document.getElementById("btn-run-simulation")?.addEventListener("click", runSimulation);
    
    // Collapsible Rules Logic
    const headerRules = document.getElementById("header-rules");
    const contentRules = document.getElementById("rules-content");
    const iconRules = document.getElementById("icon-rules");
    let isRulesCollapsed = false;

    headerRules?.addEventListener("click", () => {
        isRulesCollapsed = !isRulesCollapsed;
        if (contentRules) {
            contentRules.style.display = isRulesCollapsed ? 'none' : 'block';
        }
        if (iconRules) {
            iconRules.style.transform = isRulesCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        }
    });
    
    // Log Drawer
    const logDrawer = document.getElementById("sched-log-drawer");
    const logToggle = document.getElementById("sched-log-toggle");
    const logClose = document.getElementById("sched-log-close");
    
    logToggle?.addEventListener("click", () => {
        logDrawer?.classList.add("active");
        logToggle.style.display = 'none';
    });
    
    logClose?.addEventListener("click", () => {
        logDrawer?.classList.remove("active");
        logToggle!.style.display = 'block';
    });

    // Details Drawer
    document.getElementById("details-close-btn")?.addEventListener("click", () => {
        document.getElementById("sched-details-drawer")?.classList.remove("active");
    });
    
    // Scenario Props
    document.getElementById("btn-scenario-analyze")?.addEventListener("click", analyzeScenario);
}

function runSimulation() {
    const config: SchedulerConfig = {
        startDate: (document.getElementById("sched-start-date") as HTMLInputElement).value,
        days: parseInt((document.getElementById("sched-days") as HTMLSelectElement).value),
        shiftsPerDay: 2,
        useAffinity: (document.getElementById("rule-affinity") as HTMLInputElement).checked,
        useMonopoly: (document.getElementById("rule-monopoly") as HTMLInputElement).checked,
        useWorkloadLimit: (document.getElementById("rule-workload") as HTMLInputElement).checked,
        baselineEnabled: (document.getElementById("rule-baseline") as HTMLInputElement).checked,
        baselineCounts: {
            'doctor': parseInt((document.getElementById("base-doctor") as HTMLInputElement).value) || 0,
            'nurse': parseInt((document.getElementById("base-nurse") as HTMLInputElement).value) || 0,
            'therapist': parseInt((document.getElementById("base-therapist") as HTMLInputElement).value) || 0,
            'consultant': parseInt((document.getElementById("base-consultant") as HTMLInputElement).value) || 0,
            'admin': parseInt((document.getElementById("base-admin") as HTMLInputElement).value) || 0
        },
        monopolyThreshold: 0.4,
        maxConsecutiveShifts: 3,
        affinityWeight: 1.0
    };

    // Prepare Engine
    engine = new SchedulerEngine(dataStore.staff, dataStore.appointments, dataStore.services, new Map());
    
    // UI Loading
    document.getElementById("schedule-target")!.innerHTML = 
        `<div style="display:flex; justify-content:center; align-items:center; height:300px; color:#94a3b8; flex-direction:column;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; margin-bottom:12px;"></i>
            <span>AI 正在計算最佳排班組合...</span>
        </div>`;

    setTimeout(() => {
        currentResult = engine!.run(config);
        
        // Update Metrics
        document.getElementById("metric-coverage")!.innerText = `${currentResult.metrics.coverage}%`;
        document.getElementById("metric-overwork")!.innerText = `${currentResult.metrics.overworkedCount}`;
        document.getElementById("metric-affinity")!.innerText = `${currentResult.metrics.avgAffinityScore.toFixed(1)}`;
        // Calc hours roughly
        const total = currentResult.schedule.reduce((acc, d) => {
            let h = 0;
            if(d.shifts.AM) h += d.shifts.AM.assignments.length * 4;
            if(d.shifts.PM) h += d.shifts.PM.assignments.length * 4;
            return acc + h;
        }, 0);
        document.getElementById("metric-hours")!.innerText = `${total}h`;

        // Render Table
        renderGrid(currentResult);
        
        // Logs
        const logContent = document.getElementById("sim-log-content");
        if(logContent) logContent.innerHTML = currentResult.logs.join("<br>");
        
        // Scenario Init
        populateScenarioControls();
    }, 100);
}

function renderGrid(res: SimulationResult) {
    const target = document.getElementById("schedule-target");
    if (!target) return;

    let html = `
        <table class="sched-grid">
            <thead>
                <tr>
                    <th style="width:120px;">日期 (Date)</th>
                    <th style="width:100px;">班次 (Shift)</th>
                    <th>
                        <div style="display:flex; gap:12px;">
                            <span>醫師 <i class="fa-solid fa-circle" style="color:var(--role-doctor);font-size:0.5em;"></i></span>
                            <span>護理 <i class="fa-solid fa-circle" style="color:var(--role-nurse);font-size:0.5em;"></i></span>
                            <span>美療 <i class="fa-solid fa-circle" style="color:var(--role-therapist);font-size:0.5em;"></i></span>
                            <span>諮詢 <i class="fa-solid fa-circle" style="color:var(--role-consultant);font-size:0.5em;"></i></span>
                        </div>
                    </th>
                </tr>
            </thead>
            <tbody>
    `;

    res.schedule.forEach((day, idx) => {
        ['AM', 'PM'].forEach(shiftKey => {
            const shift = shiftKey as ShiftType;
            const shiftData = day.shifts[shift];
            if (!shiftData) return;

            // Calculate Shortage Status
            const totalShortage = Object.values(shiftData.unfilledRoles).reduce((a,b)=>a+b,0);
            const isShortage = totalShortage > 0;
            const cellClass = isShortage ? 'is-shortage' : '';

            // Check for Baseline status
            const isBaseline = (shiftData as any).isBaseline; // Cast for now if TS hasn't picked up type change
            const isEmpty = shiftData.assignments.length === 0 && !isBaseline;

            const emptyMsg = isEmpty ? 
                `<span style="color:var(--sched-text-muted); font-size:0.8rem; font-style:italic;">(此時段無預約需求)</span>` : 
                (isBaseline ? `<div style="margin-bottom:4px;"><span style="background:#e0f2fe; color:#0369a1; font-size:0.75rem; padding:2px 6px; border-radius:4px;">✨ 無預約 (套用最低值班)</span></div>` : ``);

            // Render Cell Content
            html += `
                <tr onclick="window.openSchedDetails(${idx}, '${shift}')" class="assignment-cell ${cellClass}">
                    <td class="sched-date-cell">${day.date}</td>
                    <td class="sched-shift-cell">
                        <span class="shift-badge shift-${shift.toLowerCase()}">${shift}</span>
                    </td>
                    <td>
                        <!-- Render Layout: Rows for key roles -->
                        ${emptyMsg}
                        ${!isEmpty ? renderRoleRow('doctor', shiftData.assignments, shiftData.unfilledRoles) : ''}
                        ${!isEmpty ? renderRoleRow('nurse', shiftData.assignments, shiftData.unfilledRoles) : ''}
                        ${!isEmpty ? renderRoleRow('therapist', shiftData.assignments, shiftData.unfilledRoles) : ''}
                        ${!isEmpty ? renderRoleRow('consultant', shiftData.assignments, shiftData.unfilledRoles) : ''}
                        ${!isEmpty ? renderRoleRow('admin', shiftData.assignments, shiftData.unfilledRoles) : ''}
                    </td>
                </tr>
            `;
        });
    });

    html += `</tbody></table>`;
    target.innerHTML = html;
}

function renderRoleRow(role: string, all: StaffAssignment[], unfilled: Record<string, number>) {
    const assigned = all.filter(a => a.role === role);
    const shortage = unfilled[role] || 0;
    
    if (assigned.length === 0 && shortage === 0) return ''; // Skip empty rows

    // Limit Names: Show max 2, rest as +N
    const displayLimit = 2;
    const names = assigned.slice(0, displayLimit).map(a => `<span class="staff-chip">${a.staffName}</span>`).join("");
    const more = assigned.length > displayLimit ? `<span class="more-chip">+${assigned.length - displayLimit}</span>` : "";
    
    const shortageBadge = shortage > 0 ? `<div class="shortage-indicator"><i class="fa-solid fa-triangle-exclamation"></i> 缺 ${shortage}</div>` : "";

    return `
        <div class="role-row">
            <div class="role-dot ${role}"></div>
            <div class="role-names">
                ${names}
                ${more}
                ${shortageBadge}
            </div>
        </div>
    `;
}

// Ensure global access for the OnClick
(window as any).openSchedDetails = (dayIdx: number, shift: string) => {
    if (!currentResult) return;
    const day = currentResult.schedule[dayIdx];
    const s = day.shifts[shift as ShiftType];
    const drawer = document.getElementById("sched-details-drawer");
    const content = document.getElementById("details-content");
    
    if (drawer && content && s) {
        drawer.classList.add("active");
        
        let html = `
            <div class="details-title">${day.date} - ${shift} 詳細資訊</div>
            
            <div class="details-block">
                <div class="details-label">缺口狀況</div>
                ${Object.keys(s.unfilledRoles).length === 0 ? '<span style="color:var(--role-nurse)">✅ 人力充足</span>' : ''}
                ${Object.entries(s.unfilledRoles).map(([r, c]) => c > 0 ? `<div style="color:#ef4444">${r}: 缺 ${c} 人</div>` : '').join('')}
            </div>

            <div class="details-block">
                <div class="details-label">已指派名單 (Top Scores)</div>
                <div style="font-size:0.75rem; color:var(--sched-text-muted); margin-bottom:12px;">
                    * AI 推薦分 = 技能熟練度 + 團隊默契 + 工時健康度綜合評估
                </div>
                ${s.assignments.length === 0 ? '<span style="color:var(--sched-text-muted)">無指派人員 (無需求)</span>' : ''}
                ${s.assignments.map(a => `
                    <div class="candidate-item">
                        <span>
                            ${a.staffName} 
                            <small style="color:var(--sched-text-muted); margin-left:4px;">
                                (${a.role}, 積${a.cumulativeHours || 0}h)
                            </small>
                        </span>
                        <div style="text-align:right">
                            <span class="score-badge">${a.scoreDetails?.totalScore.toFixed(0)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        content.innerHTML = html;
    }
};

// --- Scenario Logic ---
let previousResult: SimulationResult | null = null; // For Undo

function populateScenarioControls() {
    if (!currentResult) return;

    // 1. Staff List (Unique Names)
    const staffSet = new Set<string>();
    currentResult.schedule.forEach(d => {
        ['AM', 'PM'].forEach(s => {
            const shift = d.shifts[s as ShiftType];
            if (shift) shift.assignments.forEach(a => staffSet.add(a.staffName));
        });
    });
    
    const staffSelect = document.getElementById("scenario-staff") as HTMLSelectElement;
    if (staffSelect) {
        staffSelect.innerHTML = '<option value="">-- 請選擇員工 --</option>';
        Array.from(staffSet).sort().forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.innerText = name;
            staffSelect.appendChild(opt);
        });
    }

    // 2. Dates
    const dateSelect = document.getElementById("scenario-date") as HTMLSelectElement;
    if (dateSelect) {
        dateSelect.innerHTML = '<option value="">--</option>';
        currentResult.schedule.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d.date;
            opt.innerText = d.date;
            dateSelect.appendChild(opt);
        });
    }
}

function analyzeScenario() {
    if (!engine || !currentResult) return;
    
    const staffName = (document.getElementById("scenario-staff") as HTMLSelectElement).value;
    const date = (document.getElementById("scenario-date") as HTMLSelectElement).value;
    const shift = (document.getElementById("scenario-shift") as HTMLSelectElement).value as ShiftType;
    const resultArea = document.getElementById("scenario-result-area");

    if (!staffName || !date || !shift || !resultArea) {
        if(resultArea) resultArea.innerHTML = `<div style="color:red;">請完整選擇條件</div>`;
        return;
    }

    // Call Engine
    const substitutes = engine.recommendSubstitutes(currentResult, date, shift, staffName, 5);
    
    // Render Results
    if (substitutes.length === 0) {
        resultArea.innerHTML = `<div style="color:#64748b;">無符合條件的替補人選。</div>`;
        return;
    }

    const rows = substitutes.map((sub, idx) => {
        const score = sub.scoreDetails?.totalScore.toFixed(0);
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee; background:${idx===0?'#f0fdf4':'transparent'};">
                <div>
                    <div style="font-weight:600;">${sub.staffName} <span style="font-size:0.75em; color:#64748b;">(積${sub.cumulativeHours}h)</span></div>
                    <div style="font-size:0.75em; color:#64748b;">理由: Affinity:${sub.scoreDetails?.breakdown.affinity.toFixed(0)}, Base:${sub.scoreDetails?.breakdown.base}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:var(--sched-secondary);">${score}分</div>
                    <button onclick="window.applyScenario('${sub.staffName}', '${staffName}', '${date}', '${shift}')" style="font-size:0.7rem; padding:2px 6px; cursor:pointer;">套用</button>
                </div>
            </div>
        `;
    }).join("");

    resultArea.innerHTML = `
        <div style="border:1px solid #e2e8f0; border-radius:4px; max-height:200px; overflow-y:auto;">
            ${rows}
        </div>
        ${previousResult ? `<div style="margin-top:8px; text-align:right;"><button onclick="window.undoScenario()" style="color:#64748b; text-decoration:underline; font-size:0.8rem; border:none; background:none; cursor:pointer;">復原上一步 (Undo)</button></div>` : ''}
    `;
}

(window as any).applyScenario = (newStaff: string, oldStaff: string, date: string, shift: ShiftType) => {
    if (!currentResult || !engine) return;

    // Save Undo
    previousResult = JSON.parse(JSON.stringify(currentResult));

    // Find and Update
    const day = currentResult.schedule.find(d => d.date === date);
    if (!day) return;
    const s = day.shifts[shift];
    if (!s) return;

    // 1. Get Substitute (Must match logic)
    // We need to call recommendSubstitutes BEFORE removing the old staff, 
    // because recommendSubstitutes looks for the old staff to determine the Role.
    const substitutes = engine.recommendSubstitutes(currentResult, date, shift, oldStaff, 100);
    const sub = substitutes.find(a => a.staffName === newStaff);

    // 2. Remove Old
    s.assignments = s.assignments.filter(a => a.staffName !== oldStaff);

    // 3. Add New
    if (sub) {
        s.assignments.push(sub);
    }

    // Refresh UI
    renderGrid(currentResult);
    
    // Refresh Analysis Panel to show Undo option
    const resultArea = document.getElementById("scenario-result-area");
    if(resultArea) {
        resultArea.innerHTML = `
            <div style="padding:10px; background:#f0fdf4; color:#166534; border-radius:4px; font-size:0.9rem;">
                <i class="fa-solid fa-check-circle"></i> 已成功將 ${oldStaff} 替換為 ${newStaff}
            </div>
            <div style="margin-top:8px; text-align:right;"><button onclick="window.undoScenario()" style="color:#64748b; text-decoration:underline; font-size:0.8rem; border:none; background:none; cursor:pointer;">復原上一步 (Undo)</button></div>
        `;
    }
};

(window as any).undoScenario = () => {
    if (previousResult) {
        currentResult = JSON.parse(JSON.stringify(previousResult));
        previousResult = null; // Clear undo stack
        renderGrid(currentResult!);
        document.getElementById("scenario-result-area")!.innerHTML = "";
    }
};
