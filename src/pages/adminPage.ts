import { dataStore } from "../data/dataStore";
import { SystemHealthEvaluator } from "../logic/systemHealthEvaluator";
import { ValidationIssue } from "../logic/dataValidator";
import { KPI_REVENUE_STATUSES, KPI_VALID_STATUSES } from "../logic/dataValidator";

export function initAdminPage() {
    console.log("[AdminPage] Initializing...");
    renderDataHealthDashboard();
}

function renderDataHealthDashboard() {
    const report = dataStore.validationReport;
    const quarantined = dataStore.quarantinedAppointments;
    const container = document.getElementById("admin-dashboard-container");

    if (!container) {
        console.warn("[AdminPage] Container #admin-dashboard-container not found.");
        return;
    }

    if (!report) {
        container.innerHTML = `
            <div style="text-align:center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 20px;"></i>
                <p>數據驗證報告尚未生成，請稍候...</p>
            </div>
        `;
        return;
    }

    // Evaluate Status for Badge
    const status = SystemHealthEvaluator.evaluate(report);
    const levelTextMap: Record<string, string> = { 'normal': '良好', 'warning': '需留意', 'critical': '風控中' };
    const iconMap: Record<string, string> = { 'normal': '🟢', 'warning': '🟡', 'critical': '🔴' };
    const statusBadge = `<span class="status-badge ${status.level}" style="font-size: 1rem; padding: 6px 16px; border-radius: 20px; background: rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1);">${iconMap[status.level]} ${levelTextMap[status.level]}</span>`;

    // 0. Metadata Bar
    const timeStr = report.timestamp ? new Date(report.timestamp).toLocaleString('zh-TW', { hour12: false }) : '--';
    const metaBarHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px; padding: 16px; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;">
            <div style="display:flex; gap: 24px;">
                <div>
                     <span style="color:rgba(255,255,255,0.7); font-size:0.9rem;">匯入來源</span>
                     <div style="font-weight:600; font-size:1.1rem;">${report.meta.mode ? 'API (' + report.meta.mode + ')' : 'CSV File'}</div>
                </div>
                <div>
                     <span style="color:rgba(255,255,255,0.7); font-size:0.9rem;">匯入時間</span>
                     <div style="font-weight:600; font-size:1.1rem;">${timeStr}</div>
                </div>
                <div>
                     <span style="color:rgba(255,255,255,0.7); font-size:0.9rem;">Import ID</span>
                     <div style="font-family:monospace; color:var(--accent-color);">${report.meta.importId || 'LOCAL-SESSION'}</div>
                </div>
            </div>
            <div>
                 ${statusBadge}
            </div>
        </div>
    `;

    // 1. Summary Cards (Boss-Friendly, Neutral)
    const summaryHTML = `
        <div class="business-metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 24px;">
            <!-- Total -->
            <article class="metric-card metric-neutral">
                <div class="metric-header">
                    <div class="metric-icon">
                        <i class="fa-solid fa-server"></i>
                    </div>
                    <div class="metric-title-group">
                        <h3>資料總筆數</h3>
                    </div>
                </div>
                <div class="metric-body">
                    <span class="value">${formatNumber(report.meta.totalProcessed)}</span>
                </div>
            </article>

            <!-- Valid -->
            <article class="metric-card metric-neutral">
                 <div class="metric-header">
                    <div class="metric-icon">
                         <i class="fa-solid fa-check-circle"></i>
                    </div>
                    <div class="metric-title-group">
                        <h3>可用資料</h3>
                    </div>
                </div>
                <div class="metric-body">
                    <span class="value">${formatNumber(report.meta.validCount)}</span>
                </div>
            </article>

            <!-- Quarantined (Excluded) -->
            <article class="metric-card metric-neutral">
                <div class="metric-header">
                    <div class="metric-icon">
                         <i class="fa-solid fa-file-shield"></i>
                    </div>
                    <div class="metric-title-group">
                        <h3>已排除資料</h3>
                    </div>
                </div>
                <div class="metric-body">
                    <span class="value">${formatNumber(report.meta.quarantineCount)}</span>
                    <span class="sub-label" style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-top: 4px;">不影響營運決策</span>
                </div>
            </article>

            <!-- Warnings -->
            <article class="metric-card metric-neutral">
                <div class="metric-header">
                    <div class="metric-icon">
                         <i class="fa-solid fa-clipboard-check"></i>
                    </div>
                    <div class="metric-title-group">
                        <h3>資料提醒</h3>
                    </div>
                </div>
                <div class="metric-body">
                    <span class="value" style="font-size: 1.1rem; font-weight: 500;">
                        ${report.meta.warningCount > 0 ? '存在提醒事項' : '無'}
                    </span>
                    <span class="sub-label" title="數量: ${formatNumber(report.meta.warningCount)}" style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-top: 4px; cursor: help;">
                        不影響 KPI 計算
                    </span>
                </div>
            </article>
        </div>
    `;

    // 2. Error Code Distribution (Clickable tags) - Keep functional but neutralize visual if needed
    // Using existing 'filter-tag' allows CSS control.
    const errorsMap = report.meta.errorsByCode || {};
    const topErrors = Object.entries(errorsMap)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 5);
        
    const errorTagsHTML = topErrors.map(([code, count]) => `
        <button class="filter-tag" data-filter-code="${code}" onclick="AdminPage.filterIssues('${code}')">
            <span class="tag-label">${code}</span>
            <span class="tag-count">${count}</span>
        </button>
    `).join('');

    const errorSectionHTML = `
        <div class="card full-width" style="margin-bottom: 24px;">
            <div class="card-header">
                <h3>異常代碼分佈 (Top 5)</h3>
                <small style="color: var(--text-muted)">點擊代碼可篩選下方列表</small>
            </div>
            <div class="card-body" style="display:flex; gap: 10px; flex-wrap: wrap;">
                ${errorTagsHTML || '<span style="color:var(--text-muted)">無異常記錄</span>'}
                <button class="filter-tag ghost" onclick="AdminPage.clearFilters()">清除篩選</button>
            </div>
        </div>
    `;

    // 3. Issues Table Container
    const tableHTML = `
        <div class="card full-width" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
            <div class="card-header" style="flex-shrink:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <h3>詳細清單</h3>
                    <div class="table-controls" style="display:flex; gap:10px;">
                        <input type="text" id="admin-issue-search" placeholder="搜尋..." class="search-input" style="padding: 6px 12px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit;">
                        <select id="admin-severity-filter" class="setting-select" style="width: auto; padding: 4px 8px;">
                            <option value="all">全部</option>
                            <option value="error">Error</option>
                            <option value="warning">Warning</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="table-container" style="flex:1; overflow-y:auto; padding:0; background: transparent;">
                <table class="data-table" style="width:100%; border-collapse: collapse;">
                    <thead style="position:sticky; top:0; background: rgba(30,41,59,0.8); backdrop-filter: blur(10px); z-index:1;">
                        <tr>
                            <th style="padding:12px; text-align:left;">類型</th>
                            <th style="padding:12px; text-align:left;">代碼</th>
                            <th style="padding:12px; text-align:left;">欄位</th>
                            <th style="padding:12px; text-align:left;">ID</th>
                            <th style="padding:12px; text-align:left;">訊息</th>
                            <th style="padding:12px; text-align:left;">檢視</th>
                        </tr>
                    </thead>
                    <tbody id="admin-issues-tbody">
                        <!-- Dynamic -->
                    </tbody>
                </table>
            </div>
            <div class="card-footer" style="flex-shrink:0; padding:10px; border-top:1px solid var(--border-color); display:flex; justify-content:space-between; font-size: 0.85rem; color:var(--text-muted);">
                 <div>
                    <span style="margin-right:15px;">備註：KPI Rule [Completed/Paid/Checked_in]</span>
                 </div>
                 <div id="admin-table-info">--</div>
            </div>
        </div>
    `;

    // Assemble
    container.innerHTML = metaBarHTML + summaryHTML + errorSectionHTML + tableHTML;


    // Post-render inputs
    document.getElementById('admin-issue-search')?.addEventListener('input', (e) => {
        AdminPage.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
        AdminPage.renderTable();
    });
    document.getElementById('admin-severity-filter')?.addEventListener('change', (e) => {
        AdminPage.severityFilter = (e.target as HTMLSelectElement).value;
        AdminPage.renderTable();
    });

    // Initial Table Render
    AdminPage.allIssues = report.issues;
    AdminPage.renderTable();
}

function formatNumber(n: number): string {
    return n.toLocaleString();
}

// Namespace for Filter State and Methods attached to window for HTML onclick access
const AdminPage = {
    allIssues: [] as ValidationIssue[],
    searchTerm: '',
    severityFilter: 'all',
    codeFilter: '',

    filterIssues: (code: string) => {
        AdminPage.codeFilter = code;
        AdminPage.renderTable();
    },

    clearFilters: () => {
        AdminPage.codeFilter = '';
        AdminPage.severityFilter = 'all';
        AdminPage.searchTerm = '';
        (document.getElementById('admin-issue-search') as HTMLInputElement).value = '';
        (document.getElementById('admin-severity-filter') as HTMLSelectElement).value = 'all';
        AdminPage.renderTable();
    },

    renderTable: () => {
        const tbody = document.getElementById('admin-issues-tbody');
        if (!tbody) return;

        let filtered = AdminPage.allIssues.filter(issue => {
            if (AdminPage.severityFilter !== 'all' && issue.severity !== AdminPage.severityFilter) return false;
            if (AdminPage.codeFilter && issue.code !== AdminPage.codeFilter) return false;
            
            if (AdminPage.searchTerm) {
                const term = AdminPage.searchTerm;
                return issue.id.toLowerCase().includes(term) || 
                       issue.message.toLowerCase().includes(term) ||
                       issue.code.toLowerCase().includes(term);
            }
            return true;
        });

        // Limit for DOM performance
        const MAX_ROWS = 200;
        const totalFiltered = filtered.length;
        if (filtered.length > MAX_ROWS) {
            filtered = filtered.slice(0, MAX_ROWS);
        }

        tbody.innerHTML = filtered.map(issue => {
            const severityColor = issue.severity === 'error' ? '#ef4444' : (issue.severity === 'warning' ? '#f59e0b' : '#3b82f6');
            const severityIcon = issue.severity === 'error' ? 'fa-circle-xmark' : (issue.severity === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info');
            
            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); hover:background: rgba(255,255,255,0.02);">
                <td style="padding:10px;"><span style="color:${severityColor}; display:flex; align-items:center; gap:6px;"><i class="fa-solid ${severityIcon}"></i> ${issue.severity.toUpperCase()}</span></td>
                <td style="padding:10px;"><span class="badge" style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${issue.code}</span></td>
                <td style="padding:10px;">${issue.field}</td>
                <td style="padding:10px; font-family:monospace;">${issue.id}</td>
                <td style="padding:10px;">${issue.message}</td>
                <td style="padding:10px;">
                    ${issue.severity === 'error' ? 
                        `<button class="btn-xs" onclick="AdminPage.openDetails('${issue.id}', ${issue.rowIndex})">View Row</button>` : 
                        ''
                    }
                </td>
            </tr>
            `;
        }).join('');

        const info = document.getElementById('admin-table-info');
        if (info) info.textContent = `Showing ${filtered.length} / ${totalFiltered} records`;
    },

    openDetails: (id: string, rowIndex: number) => {
        // Find in quarantined
        const qRecord = dataStore.quarantinedAppointments.find(q => q.rowIndex === rowIndex); // assuming new struct
        // If not checking rowIndex, maybe just id?
        // But qRecord is { record, rowIndex, reasons } if new struct, or just AppointmentRecord if old (but we updated it conceptually)
        // Let's assume new struct or try to find it.
        
        let contentHtml = '';
        if (qRecord) {
            // It's a quarantined record
             const record = (qRecord as any).record ? (qRecord as any).record : qRecord;
             const reasons = (qRecord as any).reasons ? (qRecord as any).reasons : [];
             contentHtml = `
                <div style="margin-bottom:20px; padding:15px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px;">
                    <h4 style="color:#ef4444; margin-bottom:10px;">🚫 Quarantined Reasons</h4>
                    <ul style="padding-left:20px; color:#fca5a5;">
                        ${reasons.map((r: string) => `<li>${r}</li>`).join('') || '<li>Unknown error</li>'}
                    </ul>
                </div>
                <div style="background: #0f172a; padding: 15px; border-radius: 8px; overflow-x: auto;">
                    <pre style="color: #cbd5e1; font-family: monospace; font-size: 0.9rem;">${JSON.stringify(record, null, 2)}</pre>
                </div>
             `;
        } else {
             contentHtml = `<div style="padding:20px;">無法找到原始 Quarantined 資料 (ID: ${id}, Row: ${rowIndex})</div>`;
        }

        // Open Drawer Logic
        const drawer = document.getElementById('admin-details-drawer');
        const content = document.getElementById('admin-drawer-content');
        if(drawer && content) {
            content.innerHTML = contentHtml;
            drawer.classList.add('active');
        } else {
            // Create lazily
            createDrawer(contentHtml);
        }
    }
};

function createDrawer(iosContent: string) {
    let drawer = document.getElementById('admin-details-drawer');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'admin-details-drawer';
        drawer.className = 'right-drawer'; // Ensure CSS exists or add inline
        drawer.style.cssText = `
            position: fixed; top: 0; right: -600px; width: 600px; height: 100vh;
            background: #1e293b; box-shadow: -5px 0 25px rgba(0,0,0,0.5);
            z-index: 2000; transition: right 0.3s ease; display: flex; flex-direction: column;
            border-left: 1px solid rgba(255,255,255,0.1);
        `;
        drawer.innerHTML = `
            <div style="padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
                <h3>異常用戶資料詳情</h3>
                <button onclick="document.getElementById('admin-details-drawer').classList.remove('active')" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
            </div>
            <div id="admin-drawer-content" style="padding: 20px; overflow-y: auto; flex:1;"></div>
        `;
        document.body.appendChild(drawer);
        
        // Add active class style dynamically if not in CSS
        const style = document.createElement('style');
        style.innerHTML = `#admin-details-drawer.active { right: 0 !important; }`;
        document.head.appendChild(style);
    }
    const content = document.getElementById('admin-drawer-content');
    if(content) content.innerHTML = iosContent;
    
    // Trigger reflow to ensure transition
    setTimeout(() => drawer!.classList.add('active'), 10);
}


(window as any).AdminPage = AdminPage; // Expose to global for HTML onclick bindings
