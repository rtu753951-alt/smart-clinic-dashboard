import { dataStore } from "../data/dataStore.js";
import { initWorkloadCards, calculateWorkloadData } from "../logic/staff/staffWorkloadCards.js";
import { calculateRoleFit, generateRoleFitInsights } from "../logic/staff/staffRoleFit.js";
import { filterAppointmentsForMode, calculateBufferAnalysis, generateBufferInsights, calculateTimeStructure, generateBufferStructureReport } from "../logic/staff/staffBufferAnalysis.js";
import { generateStaffSuggestions } from "../logic/aiManager.js"; 
import { renderHiddenLoadChart } from "../logic/staff/staffHiddenLoadChart.js";

declare const Chart: any;

export function initStaffPage() {
  const currentMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
  console.log(`[StaffPage] Initializing... Global Month: ${currentMonth}`);

  const appointments = dataStore.appointments; 
  const monthAppointments = appointments.filter(a => a.date.startsWith(currentMonth));

  let updateHiddenLoadLayer: (mode: 'week' | 'month' | 'future') => void;

  // --- Layer 0: Hidden Load Chart (Interactive) ---
  try {
      const buttons = document.querySelectorAll('[data-hidden-load-mode]');
      
      updateHiddenLoadLayer = function(mode: 'week' | 'month' | 'future') {
          const filtered = filterAppointmentsForMode(appointments, mode);
          const timeStructureStats = calculateTimeStructure(filtered);
          renderHiddenLoadChart(timeStructureStats);
      }

      // Bind Events
      buttons.forEach(btn => {
          const newBtn = btn.cloneNode(true) as HTMLElement;
          btn.parentNode?.replaceChild(newBtn, btn);
          
          newBtn.addEventListener('click', (e) => {
              const allBtns = document.querySelectorAll('[data-hidden-load-mode]');
              allBtns.forEach(b => b.classList.remove('active'));
              (e.currentTarget as HTMLElement).classList.add('active');
              const mode = (e.currentTarget as HTMLElement).getAttribute('data-hidden-load-mode') as 'week' | 'month' | 'future';
              updateHiddenLoadLayer(mode);
          });
      });

      // Initial Render
      const activeBtn = document.querySelector('[data-hidden-load-mode].active');
      const initialMode = activeBtn ? activeBtn.getAttribute('data-hidden-load-mode') as 'week' | 'month' | 'future' : 'week';
      updateHiddenLoadLayer(initialMode);
      console.log("[StaffPage] Layer 0 (Hidden Load) initialized.");
  } catch (error) {
      console.error("[StaffPage] Layer 0 init failed:", error);
  }

  // Layer 1: Workload Cards
  try {
      initWorkloadCards(); 
      console.log("[StaffPage] Layer 1 (Workload Cards) initialized.");
  } catch (error) {
       console.error("[StaffPage] Layer 1 init failed:", error);
  }
  
  // Prepare data for subsequent layers
  const aiWorkloadData = calculateWorkloadData(appointments, 'week'); 

  // Layer 2: Role Fit
  let roleFitStats: any[] = [];
  try {
      roleFitStats = calculateRoleFit(monthAppointments);
      renderRoleFitChart(roleFitStats);
      renderRoleFitInsights(roleFitStats);
      console.log("[StaffPage] Layer 2 (Role Fit) initialized.");
  } catch (error) {
      console.error("[StaffPage] Layer 2 init failed:", error);
  }

  // Layer 3: Buffer Analysis
  let bufferStats: any[] = [];
  try {
      bufferStats = calculateBufferAnalysis(monthAppointments);
      const monthStructure = calculateTimeStructure(monthAppointments);
      renderBufferAnalysis(bufferStats, monthStructure);
      console.log("[StaffPage] Layer 3 (Buffer) initialized.");
  } catch (error) {
      console.error("[StaffPage] Layer 3 init failed:", error);
  }

  // Layer 4: AI Suggestions
  try {
      const aiSuggestions = generateStaffSuggestions(aiWorkloadData, roleFitStats, bufferStats);
      renderAISuggestions(aiSuggestions);
      console.log("[StaffPage] Layer 4 (AI) initialized.");
  } catch (error) {
      console.error("[StaffPage] Layer 4 init failed:", error);
  }
  // Sandbox Listener
  window.addEventListener('sandbox-change', () => {
      console.log("[StaffPage] Sandbox changed. Refreshing...");
      
      const updatedMonthAppts = dataStore.appointments.filter(a => a.date.startsWith((window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7)));

      // 1. Update Layer 0 (Hidden Load)
      const activeBtn = document.querySelector('[data-hidden-load-mode].active');
      const mode = activeBtn ? activeBtn.getAttribute('data-hidden-load-mode') as 'week' | 'month' | 'future' : 'week';
      if (updateHiddenLoadLayer) { 
          updateHiddenLoadLayer(mode);
      }

      // 2. Update Layer 1 (Workload Cards)
      // Re-init cards (calls render inside)
      initWorkloadCards();

      // 3. Update Layer 2 (Role Fit)
      const newRoleFitStats = calculateRoleFit(updatedMonthAppts);
      renderRoleFitChart(newRoleFitStats);
      renderRoleFitInsights(newRoleFitStats);

      // 4. Update Layer 3 (Buffer)
      const newBufferStats = calculateBufferAnalysis(updatedMonthAppts);
      const newMonthStructure = calculateTimeStructure(updatedMonthAppts);
      renderBufferAnalysis(newBufferStats, newMonthStructure);

      // 5. Update Layer 4 (AI)
      const newWorkloadData = calculateWorkloadData(dataStore.appointments, 'week');
      const newAiSuggestions = generateStaffSuggestions(newWorkloadData, newRoleFitStats, newBufferStats);
      renderAISuggestions(newAiSuggestions);
  });
}

// --- Render Helpers ---

function renderRoleFitChart(stats: any[]) {
    const canvas = document.getElementById('staffRoleFitChart') as HTMLCanvasElement;
    if (!canvas) return;

    if ((window as any).roleFitChartInstance) {
        (window as any).roleFitChartInstance.destroy();
    }

    const labels = stats.map(s => s.role);
    const categories = new Set<string>();
    stats.forEach(s => Object.keys(s.categoryStats).forEach(c => categories.add(c)));
    
    const datasets = Array.from(categories).map(cat => ({
        label: cat,
        data: stats.map(s => s.categoryStats[cat] || 0),
        backgroundColor: getColorForCategory(cat),
        stack: 'Stack 0',
    }));

    const ctx = canvas.getContext('2d');
    if (ctx) {
        // @ts-ignore
        (window as any).roleFitChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context: any) => `${context.dataset.label}: ${context.raw} 筆`
                        }
                    }
                },
                layout: {
                    padding: {
                        bottom: 30 // 增加底部間距，防止旋轉標籤被切斷
                    }
                },
                scales: { 
                    x: { 
                        stacked: true,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            autoSkip: false // 顯示所有標籤，不隱藏
                        }
                    }, 
                    y: { stacked: true } 
                }
            }
        });
    }
}

function getColorForCategory(cat: string): string {
    const colors: Record<string, string> = {
        'inject': '#3b82f6',
        'laser': '#ef4444',
        'consult': '#10b981',
        'drip': '#f59e0b', 
        'facial': '#8b5cf6',
        'other': '#9ca3af'
    };
    return colors[cat] || colors['other'];
}

function renderRoleFitInsights(stats: any[]) {
    const container = document.getElementById('staff-structure-insights');
    if (!container) return;
    
    const insights = generateRoleFitInsights(stats);
    container.innerHTML = insights.map(i => `
        <li style="margin-bottom: 8px; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 4px; border-left: 3px solid #ccc;">
            ${i}
        </li>
    `).join('');
}

// Module-level state for sorting
let cachedBufferStats: any[] = [];
let cachedTimeStructureStats: any[] = [];
let currentSort: { key: string, dir: 'asc' | 'desc' } = { key: 'compressionRate', dir: 'desc' };

function renderBufferAnalysis(bufferStats: any[], timeStructureStats: any[]) {
    const container = document.getElementById('staffBufferAnalysis');
    if (!container) return;

    // Update Cache
    cachedBufferStats = [...bufferStats]; // Copy
    cachedTimeStructureStats = [...timeStructureStats];

    const reportHtml = generateBufferStructureReport(timeStructureStats);
    
    // Create Table Container
    const tableContainerId = 'buffer-analysis-table-container';
    
    container.innerHTML = reportHtml + `<div id="${tableContainerId}" style="margin-top: 20px;"></div>`;

    renderBufferTable();
}

function renderBufferTable() {
    const container = document.getElementById('buffer-analysis-table-container');
    if (!container) return;

    // Sorting Logic
    const sortedStats = [...cachedBufferStats].sort((a, b) => {
        const dir = currentSort.dir === 'asc' ? 1 : -1;
        
        if (currentSort.key === 'role') {
            // Parse "Name (RoleType)"
            const parse = (str: string) => {
                const match = str.match(/^(.*)\((.*)\)$/);
                return match ? { name: match[1].trim(), type: match[2].trim() } : { name: str, type: '' };
            };
            const pA = parse(a.role);
            const pB = parse(b.role);
            
            // Primary: Type (A-Z)
            if (pA.type !== pB.type) return pA.type.localeCompare(pB.type) * dir;
            // Secondary: Name (A-Z)
            return pA.name.localeCompare(pB.name) * dir;
        }
        
        if (currentSort.key === 'bufferRatio') {
            // Need to look up from TimeStructure
            const getRatio = (roleStr: string) => {
                const roleType = roleStr.includes('(') ? roleStr.split('(')[1].replace(')', '').trim() : roleStr;
                return cachedTimeStructureStats.find(t => t.role === roleType)?.bufferRatio || 0;
            };
            return (getRatio(a.role) - getRatio(b.role)) * dir;
        }

        if (currentSort.key === 'compressedGaps') {
            return (a.compressedGaps - b.compressedGaps) * dir;
        }

        if (currentSort.key === 'compressionRate') {
            return (a.compressionRate - b.compressionRate) * dir;
        }

        return 0;
    });

    // Header Helper
    const th = (label: string, key: string) => {
        let arrow = '';
        if (currentSort.key === key) {
            arrow = currentSort.dir === 'desc' ? ' ▼' : ' ▲';
        }
        return `<th style="padding: 8px; cursor: pointer; user-select: none;" data-sort-key="${key}" class="sortable-header">
            ${label} <span style="font-size: 0.8em;">${arrow}</span>
        </th>`;
    };

    const tableHtml = `
            <h5 style="margin-bottom: 10px; color: #666;">詳細監測數據 (Buffer 壓縮率)</h5>
            <table class="data-table" style="width: 100%; font-size: 0.9rem; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #eee; text-align: left;">
                        ${th('人員', 'role')}
                        ${th('Buffer 佔比 (結構)', 'bufferRatio')}
                        ${th('被壓縮次數 (壓力)', 'compressedGaps')}
                        ${th('壓縮率', 'compressionRate')}
                    </tr>
                </thead>
                <tbody>
                    ${sortedStats.map(s => {
                         const roleType = s.role.includes('(') ? s.role.split('(')[1].replace(')', '').trim() : s.role;
                         const struct = cachedTimeStructureStats.find(t => t.role === roleType) || { bufferRatio: 0 };
                         
                         return `
                        <tr style="border-bottom: 1px solid #f9f9f9;">
                            <td style="padding: 8px;">${s.role}</td>
                            <td style="padding: 8px; color: #666;">${struct.bufferRatio}%</td> 
                            <td style="padding: 8px;">${s.compressedGaps}</td>
                            <td style="padding: 8px; font-weight: bold; color: ${s.compressionRate >= 70 ? '#dc2626' : (s.compressionRate >= 30 ? '#f97316' : '#059669')};">
                                ${s.compressionRate}%
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            <small style="color: #666; display: block; margin-top: 5px; font-style: italic;">
                ＊壓縮率超過 70%會觸發<span style="color:#dc2626; font-weight:bold;">紅色警示</span>；30% 至 70%列為<span style="color:#f97316; font-weight:bold;">「隱性疲勞風險」</span>＊<br/>
                * Buffer 佔比數據請參考上方顧問報告
            </small>
    `;

    container.innerHTML = tableHtml;

    // Bind Events
    const headers = container.querySelectorAll('th[data-sort-key]');
    headers.forEach(h => {
        h.addEventListener('click', () => {
             const key = h.getAttribute('data-sort-key');
             if (key) {
                 if (currentSort.key === key) {
                     // Toggle
                     currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
                 } else {
                     // New Key -> Default Desc (Large to Small) for numbers, but maybe Asc for text?
                     // User said: "第一次點：降冪（大→小）" for fields.
                     // For 'role' (text), usually Asc is intuitive, but user didn't specify strict exception except "Main: A-Z".
                     // Let's stick to Desc default for now as user requested "Default: Desc", then toggle.
                     // Actually user said: "第一次點：降冪（大→小）".
                     currentSort.key = key;
                     currentSort.dir = 'desc';
                 }
                 renderBufferTable();
             }
        });
    });
}

function renderAISuggestions(htmlContent: string) {
    const container = document.getElementById('staff-ai-suggestions-container');
    if (container) {
        container.innerHTML = htmlContent;
    }
}

(window as any).initStaffPage = initStaffPage;
