declare const Chart: any;

interface TimeStructureStats {
    role: string;
    serviceMinutes: number;
    bufferMinutes: number; // Based on Standard Buffer definition
    totalMinutes: number;
    bufferRatio: number; // %
}

// Chart Instance 儲存變數 (Module Scope)
let hiddenLoadChartChange: any = null;

export function destroyHiddenLoadChart() {
    if (hiddenLoadChartChange) {
        hiddenLoadChartChange.destroy();
        hiddenLoadChartChange = null;
        console.log('[HiddenLoadChart] Destroyed instance');
    }
}

// Attach to window for global cleanup access (like pageController)
(window as any).destroyHiddenLoadChart = destroyHiddenLoadChart;

const ROLE_NAMES_CN: Record<string, string> = {
  doctor: "醫師",
  nurse: "護理師",
  therapist: "美療師",
  consultant: "諮詢師",
  admin: "行政",
  other: "其他"
};

/**
 * 初始化並繪製：SOP 基準 vs 實際人力負荷 (診斷視圖)
 * @param stats 時間結構統計資料 (normalized to daily average)
 */
export function renderHiddenLoadChart(stats: TimeStructureStats[]): void {
  const canvas = document.getElementById('staffHiddenLoadChart') as HTMLCanvasElement;
  if (!canvas) {
      console.warn('staffHiddenLoadChart canvas not found');
      return;
  }

  // 1. 準備資料
  const order = ['doctor', 'consultant', 'therapist', 'nurse'];
  const sortedStats = order.map(role => {
      const found = stats.find(s => s.role === role);
      // serviceMinutes => SOP Benchmark
      // bufferMinutes => Hidden Load
      return found || { role, serviceMinutes: 0, bufferMinutes: 0, totalMinutes: 0, bufferRatio: 0 };
  });

  const labels = sortedStats.map(s => ROLE_NAMES_CN[s.role] || s.role);
  const sopData = sortedStats.map(s => s.serviceMinutes);
  const hiddenData = sortedStats.map(s => s.bufferMinutes);

  // 2. 更新或初始化
  if (hiddenLoadChartChange) {
      hiddenLoadChartChange.data.labels = labels;
      hiddenLoadChartChange.data.datasets[0].data = sopData;
      hiddenLoadChartChange.data.datasets[1].data = hiddenData;
      hiddenLoadChartChange.update();
      console.log('Diagnostic Chart Updated');
      return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  hiddenLoadChartChange = new Chart(ctx, {
      type: 'bar',
      data: {
          labels: labels,
          datasets: [
              {
                  label: 'SOP 基準 (Value-Add)',
                  data: sopData,
                  backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue
                  hoverBackgroundColor: 'rgba(59, 130, 246, 1.0)',
                  stack: 'Stack 0',
                  barPercentage: 0.6
              },
              {
                  label: '結構性隱性負載 (Hidden)',
                  data: hiddenData,
                  backgroundColor: 'rgba(239, 68, 68, 0.5)', // Pink/Red
                  hoverBackgroundColor: 'rgba(239, 68, 68, 0.7)',
                  stack: 'Stack 0',
                  barPercentage: 0.6
              }
          ]
      },
      options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
              title: {
                  display: true,
                  text: 'SOP 基準 vs 實際人力負荷 (診斷視圖)',
                  font: { size: 16, family: "'Noto Sans TC', sans-serif", weight: 'bold' },
                  padding: { top: 10, bottom: 20 },
                  color: '#374151'
              },
              legend: {
                  position: 'top',
                  labels: { 
                      font: { family: "'Noto Sans TC', sans-serif" },
                      usePointStyle: true,
                      padding: 20
                  }
              },
              tooltip: {
                  mode: 'index',
                  intersect: false,
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  titleColor: '#1f2937',
                  bodyColor: '#4b5563',
                  borderColor: '#e5e7eb',
                  borderWidth: 1,
                  padding: 12,
                  callbacks: {
                      label: function(context: any) {
                          const label = context.dataset.label || '';
                          const value = context.raw || 0;
                          return `${label}: ${value} 分鐘/人`;
                      },
                      afterBody: function(tooltipItems: any[]) {
                          const sopItem = tooltipItems.find(i => i.datasetIndex === 0);
                          const hiddenItem = tooltipItems.find(i => i.datasetIndex === 1);
                          
                          const sop = sopItem ? (sopItem.raw as number) : 0;
                          const hidden = hiddenItem ? (hiddenItem.raw as number) : 0;
                          const total = sop + hidden;
                          
                          if (total > 0) {
                              const ratio = Math.round((hidden / total) * 100);
                              return `----------------\n實際負荷總計: ${total} 分鐘\n隱性佔比: ${ratio}%\n(此為流程結構診斷，非績效)`;
                          }
                          return '';
                      }
                  },
                  titleFont: { family: "'Noto Sans TC', sans-serif", size: 13 },
                  bodyFont: { family: "'Noto Sans TC', sans-serif", size: 12 }
              }
          },
          scales: {
              x: {
                  stacked: true,
                  ticks: { font: { family: "'Noto Sans TC', sans-serif" }, color: '#6b7280' },
                  grid: { display: false }
              },
              y: {
                  stacked: true,
                  beginAtZero: true,
                  title: {
                      display: true,
                      text: '平均單日工時 (分鐘/人)',
                      font: { size: 12, family: "'Noto Sans TC', sans-serif" },
                      color: '#9ca3af'
                  },
                  ticks: { font: { family: "'Noto Sans TC', sans-serif" }, color: '#9ca3af' },
                  grid: { borderDash: [2, 2], color: '#f3f4f6' }
              }
          },
          interaction: {
              mode: 'nearest',
              axis: 'x',
              intersect: false
          }
      }
  });

  console.log('Hidden Load Diagnostic Chart Initialized');
}
