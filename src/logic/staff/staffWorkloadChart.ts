// 讓 TypeScript 知道 Chart 來自全域變數（從 HTML CDN 載入）
declare const Chart: any;

import { AppointmentRecord } from "../../data/schema.js";
import { dataStore } from "../../data/dataStore.js";
import { sandboxStore } from "../../features/sandbox/sandboxStore.js";

/**
 * 人力負載壓力分析圖表
 * 
 * 需求：
 * 1. 總工時 = 職務總人數 × 8小時/天 × 7天/週
 * 2. 實際工時計算：
 *    - 今天之前（不含今天）：只計算 completed 的預約
 *    - 今天及之後：不管 completed、no_show、cancelled 都納入計算
 * 3. 使用醫師介入比例模型計算等效工時
 * 4. 與右上方月份選單同步
 */

import { INVOLVEMENT_RATIOS } from "../../data/treatmentRatios.js";

// 職務人數設定（從 staff.csv 動態計算）
function getStaffCounts(): Record<string, number> {
  const counts: Record<string, number> = {
    doctor: 0,
    consultant: 0,
    nurse: 0,
    therapist: 0
  };

  dataStore.staff.forEach(staff => {
    if (staff.status === 'active' || staff.status === 'Active') {
      const type = staff.staff_type;
      if (counts[type] !== undefined) {
        counts[type]++;
      }
    }
  });

  return counts;
}

// 職務中文名稱映射
const ROLE_NAMES: Record<string, string> = {
  doctor: "醫師",
  consultant: "諮詢師",
  nurse: "護理師",
  therapist: "美療師",
  admin: "行政人員"
};

// 職務顏色映射
const ROLE_COLORS: Record<string, string> = {
  doctor: "rgba(59, 130, 246, 0.8)",      // 藍色
  consultant: "rgba(139, 92, 246, 0.8)",  // 紫色
  nurse: "rgba(16, 185, 129, 0.8)",       // 綠色
  therapist: "rgba(236, 72, 153, 0.8)",    // 粉色
  admin: "rgba(107, 114, 128, 0.8)"       // 灰色
};

interface WorkloadData {
  role: string;
  usedHours: number;
  totalHours: number;
  percentage: number;
}

/**
 * 計算人力負載資料
 * @param appointments 預約記錄
 * @param targetMonth 目標月份 (YYYY-MM)
 */
export function calculateStaffWorkloadData(
  appointments: AppointmentRecord[],
  targetMonth: string
): WorkloadData[] {
  const today = new Date("2025-12-16"); // 基準日期
  today.setHours(0, 0, 0, 0);

  // 篩選目標月份的預約
  const monthAppointments = appointments.filter(apt => {
    return apt.date.startsWith(targetMonth);
  });

  // 進一步篩選：根據日期決定是否計入
  const filteredAppointments = monthAppointments.filter(apt => {
    const aptDate = new Date(apt.date);
    aptDate.setHours(0, 0, 0, 0);

    if (aptDate < today) {
      // 今天之前（不含今天）：只計算 completed
      return apt.status === "completed";
    } else {
      // 今天及之後：全部納入計算（不管 completed、no_show、cancelled）
      return true;
    }
  });

  // 初始化統計
  const stats: Record<string, { usedMinutes: number }> = {
    doctor: { usedMinutes: 0 },
    consultant: { usedMinutes: 0 },
    nurse: { usedMinutes: 0 },
    therapist: { usedMinutes: 0 },
    admin: { usedMinutes: 0 }
  };

  // 取得 Sandbox 狀態
  const sbState = sandboxStore.getState();

  // 計算等效工時
  filteredAppointments.forEach(apt => {
    const service = dataStore.services.find(s => s.service_name === apt.service_item);
    
    const duration = service ? service.duration : 30;
    const buffer = service ? service.buffer_time : 10;
    const totalMinutes = duration + buffer;

    // 取得療程類別以決定介入比例
    const category = service?.category || 'other'; // Safe default
    const ratios = INVOLVEMENT_RATIOS[category] || INVOLVEMENT_RATIOS['other'];
    
    // Sandbox Growth Factor
    const growthFactor = sbState.isActive ? (1 + (sbState.serviceGrowth[category as keyof typeof sbState.serviceGrowth] || 0)) : 1;

    // Determine Role
    let roleFromStaff = '';
    
    // 1. Try assistant_role from record
    if (apt.assistant_role) {
         const raw = apt.assistant_role.trim().toLowerCase();
         if (raw.includes('nurse')) roleFromStaff = 'nurse';
         else if (raw.includes('therapist')) roleFromStaff = 'therapist';
         else roleFromStaff = raw;
    }

    // 2. Fallback to name lookup (Need staffMap access? It's not in scope here!)
    // We need to look it up from dataStore.staff
    if (!roleFromStaff && apt.assistant_name) {
         const s = dataStore.staff.find(st => st.staff_name === apt.assistant_name);
         if (s) roleFromStaff = s.staff_type;
    }

    const primaryRole = (service?.executor_role || roleFromStaff || apt.assistant_name) as string;

    // 應用介入比例計算等效工時 (乘上成長率)
    // 醫師等效工時
    const doctorRatio = ratios.doctor || 0;
    if (doctorRatio > 0) {
      stats['doctor'].usedMinutes += totalMinutes * doctorRatio * growthFactor;
    }

    // 諮詢師等效工時
    const consultantRatio = ratios.consultant || 0;
    if (consultantRatio > 0) {
      stats['consultant'].usedMinutes += totalMinutes * consultantRatio * growthFactor;
    }

    // 美療師等效工時
    if (primaryRole === 'therapist' || category === 'laser') {
      stats['therapist'].usedMinutes += totalMinutes * growthFactor;
    }

    // 護理師等效工時
    if (primaryRole === 'nurse' || category === 'drip') {
      stats['nurse'].usedMinutes += totalMinutes * growthFactor;
    } else if (primaryRole === 'doctor') {
      stats['nurse'].usedMinutes += totalMinutes * 0.25 * growthFactor;
    } else if (primaryRole === 'therapist') {
      stats['nurse'].usedMinutes += totalMinutes * 0.15 * growthFactor;
    }
  });

  // --- INTEGRATION: staff_workload.csv (Manual Records) ---
  const manualWorkload = dataStore.staffWorkload || [];
  manualWorkload.forEach(rec => {
      // 1. Date Check (Must match targetMonth)
      if (!rec.date.startsWith(targetMonth)) return;

      const d = new Date(rec.date);
      // Same logic as filteredAppointments: 
      // If < today, included. If >= today, included. 
      // Since manual records are usually "done" or "planned", we include them if they exist in the file for this month.
      // But let's respect the "Today" logic if needed? 
      // Usually manual records are retrospective or specific plans. Let's include all matching month.
      
      const name = rec.staff_name.trim();
      let role = ''; // derive
      
      // Try map
      const s = dataStore.staff.find(st => st.staff_name === name);
      if (s) role = s.staff_type;
      
      // Fallback
      if (!role) {
           // 1. Check Action Type
           const type = (rec.action_type || '').toLowerCase();
           if (type === 'admin' || type.includes('admin')) role = 'admin';

           // 2. Check Name / ID
           else if (name.includes('行政') || name.toLowerCase().includes('admin')) role = 'admin';
           else if (name.includes('S016')) role = 'admin'; 

           else if (name.includes('醫師')) role = 'doctor';
           else if (name.includes('護理師')) role = 'nurse';
           else if (name.includes('美療師')) role = 'therapist';
           else if (name.includes('諮詢師')) role = 'consultant';
      }

      if (role && stats[role]) {
           let estMins = 60;
           if (role === 'consultant') estMins = 30;
           if (role === 'admin') estMins = 60;

           const activeMins = (rec.minutes && rec.minutes > 0) ? rec.minutes : (rec.count * estMins);
           stats[role].usedMinutes += activeMins;
      }
  });

  // 取得職務人數
  const staffCounts = getStaffCounts();

  // 計算總工時和負載率
  const result: WorkloadData[] = [];

  Object.keys(stats).forEach(role => {
    // Sandbox Staff Delta
    let count = staffCounts[role] || 0;
    if (sbState.isActive) {
        count += (sbState.staffDeltas[role as keyof typeof sbState.staffDeltas] || 0);
    }
    // 防止人數變負數
    count = Math.max(0, count);
    
    // 總工時 = 職務總人數 × 8小時/天 × 7天/週 × 週數
    // 計算該月有幾週（簡化：假設每月4週）
    const weeksInMonth = 4;
    const totalHours = count * 8 * 7 * weeksInMonth;
    
    const usedHours = stats[role].usedMinutes / 60;
    const percentage = totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0;

    result.push({
      role,
      usedHours: Math.round(usedHours * 10) / 10,
      totalHours,
      percentage: Math.min(100, percentage)
    });
  });

  return result;
}

/**
 * 渲染人力負載壓力分析圖表
 */
let workloadChart: Chart | null = null;

export function renderStaffWorkloadChart(targetMonth: string): void {
  const canvas = document.getElementById('staffWorkloadChart') as HTMLCanvasElement;
  if (!canvas) {
    console.warn('staffWorkloadChart canvas not found');
    return;
  }

  const workloadData = calculateStaffWorkloadData(dataStore.appointments, targetMonth);

  // 準備圖表資料
  const labels = workloadData.map(d => ROLE_NAMES[d.role] || d.role);
  const usedData = workloadData.map(d => d.usedHours);
  const totalData = workloadData.map(d => d.totalHours);
  const percentageData = workloadData.map(d => d.percentage);

  // 銷毀舊圖表
  if (workloadChart) {
    workloadChart.destroy();
  }

  // 創建新圖表
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  workloadChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '實際工時 (小時)',
          data: usedData,
          backgroundColor: workloadData.map(d => ROLE_COLORS[d.role]),
          borderColor: workloadData.map(d => ROLE_COLORS[d.role].replace('0.8', '1')),
          borderWidth: 2,
          borderRadius: 8,
          barPercentage: 0.7
        },
        {
          label: '總工時 (小時)',
          data: totalData,
          backgroundColor: 'rgba(200, 200, 200, 0.3)',
          borderColor: 'rgba(150, 150, 150, 0.5)',
          borderWidth: 1,
          borderRadius: 8,
          barPercentage: 0.7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: '人力負載壓力分析',
          font: {
            size: 16,
            weight: 'bold',
            family: "'Noto Sans TC', sans-serif"
          },
          color: '#1f2937'
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: {
              family: "'Noto Sans TC', sans-serif"
            },
            color: '#4b5563'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context: any) {
              const index = context.dataIndex;
              const datasetLabel = context.dataset.label || '';
              const value = context.parsed?.y;
              const percentage = percentageData[index];
              
              if (value === null || value === undefined) {
                return datasetLabel;
              }
              
              if (datasetLabel.includes('實際工時')) {
                return `${datasetLabel}: ${value.toFixed(1)} 小時 (負載率: ${percentage}%)`;
              }
              return `${datasetLabel}: ${value.toFixed(1)} 小時`;
            }
          },
          titleFont: {
            family: "'Noto Sans TC', sans-serif"
          },
          bodyFont: {
            family: "'Noto Sans TC', sans-serif"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: {
              family: "'Noto Sans TC', sans-serif"
            },
            color: '#6b7280'
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: {
              family: "'Noto Sans TC', sans-serif"
            },
            color: '#6b7280',
            callback: function(value: any) {
              return value + ' 小時';
            }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      }
    }
  });

  console.log('人力負載壓力分析圖表已渲染:', workloadData);
}

/**
 * 初始化圖表（與月份選單同步）
 */
export function initStaffWorkloadChart(): void {
  // 取得全域月份選擇器
  const monthSelector = document.getElementById('global-month-selector') as HTMLSelectElement;
  if (!monthSelector) {
    console.warn('global-month-selector not found');
    return;
  }

  // 初始渲染
  const initialMonth = monthSelector.value || '2025-12';
  renderStaffWorkloadChart(initialMonth);

  // 監聽月份變更
  monthSelector.addEventListener('change', () => {
    const selectedMonth = monthSelector.value;
    renderStaffWorkloadChart(selectedMonth);
  });
}
