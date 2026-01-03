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

  // --- Layer 0: Hidden Load Chart (Interactive) ---
  try {
      const buttons = document.querySelectorAll('[data-hidden-load-mode]');
      
      function updateHiddenLoadLayer(mode: 'week' | 'month' | 'future') {
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

function renderBufferAnalysis(bufferStats: any[], timeStructureStats: any[]) {
    const container = document.getElementById('staffBufferAnalysis');
    if (!container) return;

    const reportHtml = generateBufferStructureReport(timeStructureStats);
    
    const tableHtml = `
        <div style="margin-top: 20px;">
            <h5 style="margin-bottom: 10px; color: #666;">詳細監測數據 (Buffer 壓縮率)</h5>
            <table class="data-table" style="width: 100%; font-size: 0.9rem; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #eee; text-align: left;">
                        <th style="padding: 8px;">人員</th>
                        <th style="padding: 8px;">Buffer 佔比 (結構)</th>
                        <th style="padding: 8px;">被壓縮次數 (壓力)</th>
                        <th style="padding: 8px;">壓縮率</th>
                    </tr>
                </thead>
                <tbody>
                    ${bufferStats.map(s => {
                         // Parse role type from "Name (role)" string
                         const roleType = s.role.includes('(') ? s.role.split('(')[1].replace(')', '').trim() : s.role;
                         const struct = timeStructureStats.find(t => t.role === roleType) || { bufferRatio: 0 };
                         
                         return `
                        <tr style="border-bottom: 1px solid #f9f9f9;">
                            <td style="padding: 8px;">${s.role}</td>
                            <td style="padding: 8px; color: #666;">${struct.bufferRatio}%</td> 
                            <td style="padding: 8px;">${s.compressedGaps}</td>
                            <td style="padding: 8px; font-weight: bold; color: ${s.compressionRate > 30 ? '#dc2626' : '#059669'};">
                                ${s.compressionRate}%
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            <small style="color: #999; display: block; margin-top: 5px;">* Buffer 佔比數據請參考上方顧問報告</small>
        </div>
    `;

    container.innerHTML = reportHtml + tableHtml;
}

function renderAISuggestions(htmlContent: string) {
    const container = document.getElementById('staff-ai-suggestions-container');
    if (container) {
        container.innerHTML = htmlContent;
    }
}

(window as any).initStaffPage = initStaffPage;
