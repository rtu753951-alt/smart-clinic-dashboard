// 讓 TypeScript 知道這些來自全域
declare const Chart: any;

import { AppointmentRecord } from "../../data/schema.js";
import { dataStore } from "../../data/dataStore.js";

/**
 * 人力負載壓力分析 - 卡片式顯示
 * 
 * 特點：
 * 1. 使用卡片 + 進度條，一眼看懂負載情況
 * 2. 支援本週/下週/未來30天切換
 * 3. 顯示實際工時、總工時、負載率、任務數
 * 4. 使用醫師介入比例模型
 */

// Doctor involvement ratio model with consultation role split
export const INVOLVEMENT_RATIOS: Record<string, Record<string, number>> = {
  inject: { doctor: 0.4, therapist: 0.2, nurse: 0.6, consultant: 0.4 },
  rf: { doctor: 0.6, therapist: 0.8, nurse: 0.4, consultant: 0.3 },
  laser: { doctor: 0.2, therapist: 0.8, nurse: 0.5, consultant: 0.2 },
  drip: { doctor: 0.05, therapist: 0.1, nurse: 0.9, consultant: 0.1 },
  consult: { doctor: 0.10, therapist: 0, nurse: 0, consultant: 1.0 }
};

/**
 * 建立員工名稱對職務的對照表 (Dynamic Mapping)
 * Key: staff_name (e.g., "陳醫師"), Value: staff_type (e.g., "doctor")
 */
function getStaffRoleMap(): Map<string, string> {
  const map = new Map<string, string>();
  dataStore.staff.forEach(staff => {
    if (staff.staff_name) {
      map.set(staff.staff_name.trim(), staff.staff_type.trim());
    }
  });
  return map;
}

// 職務中文名稱映射
const ROLE_NAMES: Record<string, string> = {
  doctor: "醫師",
  consultant: "諮詢師",
  nurse: "護理師",
  therapist: "美療師"
};

// 職務圖標映射
const ROLE_ICONS: Record<string, string> = {
  doctor: "👨‍⚕️",
  consultant: "💼",
  nurse: "👩‍⚕️",
  therapist: "💆‍♀️"
};

export interface WorkloadData {
  role: string;
  usedHours: number;
  totalHours: number;
  percentage: number;
  taskCount: number;
  status: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 計算負載狀態
 */
function getLoadStatus(percentage: number): 'low' | 'medium' | 'high' | 'critical' {
  if (percentage >= 90) return 'critical';
  if (percentage >= 70) return 'high';
  if (percentage >= 40) return 'medium';
  return 'low';
}

/**
 * 取得狀態文字
 */
function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    low: '輕鬆',
    medium: '適中',
    high: '偏高',
    critical: '過載'
  };
  return statusMap[status] || '正常';
}

/**
 * 篩選指定週期的預約
 */
function filterAppointmentsByPeriod(
  appointments: AppointmentRecord[],
  period: "week" | "next_week" | "future30"
): AppointmentRecord[] {
  // 1. 決定基準日期 (Anchor Date)
  const globalMonth = (window as any).currentDashboardMonth;
  let anchorDate = new Date(); // Default to Now

  if (globalMonth) {
      // e.g. "2024-01" -> Anchor "2024-01-01"
      anchorDate = new Date(`${globalMonth}-01`);
  }

  anchorDate.setHours(0, 0, 0, 0);

  const currentDay = anchorDate.getDay(); // 0 (Sun) to 6 (Sat)
  // 週一為一週開始
  const distToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const thisMonday = new Date(anchorDate);
  thisMonday.setDate(anchorDate.getDate() + distToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date;

  switch (period) {
    case "week":
      // Anchor Week
      startDate = new Date(thisMonday);
      endDate = new Date(thisMonday);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "next_week":
      startDate = new Date(thisMonday);
      startDate.setDate(startDate.getDate() + 7);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "future30":
      startDate = new Date(anchorDate); 
      endDate = new Date(anchorDate);
      endDate.setDate(endDate.getDate() + 29);
      endDate.setHours(23, 59, 59, 999);
      break;
  }

  const result = appointments.filter(apt => {
    const aptDate = new Date(apt.date);
    if (isNaN(aptDate.getTime())) return false;
    aptDate.setHours(0, 0, 0, 0);
    
    // Check Date Range
    if (aptDate < startDate || aptDate > endDate) return false;

    // Check Status (Relaxed: count all valid types)
    const status = (apt.status || '').toLowerCase().trim();
    if (status === 'cancelled' || status === 'no_show') return false; 
    
    return true; // Count completed, booked, checking, etc.
  });

  // Critical Debug Log
  console.log(`[Workload] Filtering '${period}' with Anchor ${anchorDate.toISOString().slice(0,10)}`);
  console.log(`[Workload] Range: ${startDate.toISOString().slice(0,10)} ~ ${endDate.toISOString().slice(0,10)}`);
  console.log(`[Workload] Matches: ${result.length} (from ${appointments.length})`);

  return result;
}

/**
 * 計算總天數
 */
function getTotalDays(period: "week" | "next_week" | "future30" | "month"): number {
  if (period === "future30" || period === "month") return 30;
  return 7;
}

/**
 * 計算人力負載資料
 */
export function calculateWorkloadData(
  appointments: AppointmentRecord[],
  period: "week" | "next_week" | "future30" | "month"
): WorkloadData[] {
  let filteredAppointments: AppointmentRecord[] = [];

  if (period === 'month') {
    // 當月模式：假設已由外部 filter 好
    filteredAppointments = appointments;
  } else {
    filteredAppointments = filterAppointmentsByPeriod(appointments, period);
  }

  // 1. 建立角色與人員對照
  const staffMap = getStaffRoleMap();
  
  console.log("🔍 Workload Debug:", {
      mapEntries: staffMap.size,
      totalAppointments: appointments.length,
      filteredCount: filteredAppointments.length,
      period
  });

  // 準備統計容器
  const stats: Record<string, { usedMinutes: number; taskCount: number; activeStaffCount: number }> = {
    doctor: { usedMinutes: 0, taskCount: 0, activeStaffCount: 0 },
    consultant: { usedMinutes: 0, taskCount: 0, activeStaffCount: 0 },
    nurse: { usedMinutes: 0, taskCount: 0, activeStaffCount: 0 },
    therapist: { usedMinutes: 0, taskCount: 0, activeStaffCount: 0 }
  };

  // 計算各職務 Active 人數 (分母)
  dataStore.staff.forEach(s => {
      const type = s.staff_type.trim(); // e.g. 'nurse'
      const status = (s.status || '').toLowerCase();
      if (stats[type] && status === 'active') {
          stats[type].activeStaffCount++;
      }
  });

  // 2. 遍歷預約累積數據
  filteredAppointments.forEach(apt => {
    
    const service = dataStore.services.find(s => s.service_name === apt.service_item);
    const duration = service ? service.duration : 60; // default 60 if not found
    const buffer = service ? service.buffer_time : 10;
    const totalMinutes = duration + buffer;

    // 定義該 Service 的介入比例模型
    const category = service?.category || 'inject'; // default fallback
    const ratios = INVOLVEMENT_RATIOS[category] || INVOLVEMENT_RATIOS['inject'];

    // --- 統計 Doctor ---
    if (apt.doctor_name && apt.doctor_name !== 'nan') {
        const docName = apt.doctor_name.trim();
        const role = staffMap.get(docName);
        if (role === 'doctor' && stats['doctor']) {
             const ratio = ratios.doctor || 0;
             if (ratio > 0) {
                 stats['doctor'].usedMinutes += totalMinutes * ratio;
                 stats['doctor'].taskCount++; 
             }
        }
    }

    // --- 統計 Primary Staff ---
    if (apt.staff_role && (apt.staff_role as string) !== 'nan') {
        const staffName = (apt.staff_role as string).trim();
        const role = staffMap.get(staffName); // 透過名字查表！
        
        if (role && stats[role]) {
            const ratio = ratios[role] || 0; 
            // 如果 ratio 為 0 但被指派，可能做雜務，給 0.1
            const effectiveRatio = ratio === 0 ? 0.1 : ratio;
            
            stats[role].usedMinutes += totalMinutes * effectiveRatio;
            stats[role].taskCount++;
        }
    }
  });

  // 3. 計算最終指標
  const totalDays = getTotalDays(period);
  const result: WorkloadData[] = [];

  Object.keys(stats).forEach(role => {
    const { usedMinutes, taskCount, activeStaffCount } = stats[role];
    const capacityHours = activeStaffCount * 8 * totalDays;
    const usedHours = usedMinutes / 60;
    const percentage = capacityHours > 0 ? Math.round((usedHours / capacityHours) * 100) : 0;

    result.push({
      role,
      usedHours: Math.round(usedHours * 10) / 10,
      totalHours: capacityHours,
      percentage: Math.min(100, percentage),
      taskCount: taskCount,
      status: getLoadStatus(percentage)
    });
  });

  console.log("✅ Workload Result:", result);
  return result;
}

/**
 * 渲染單張卡片
 */
function renderWorkloadCard(data: WorkloadData): string {
  const roleName = ROLE_NAMES[data.role] || data.role;
  const roleIcon = ROLE_ICONS[data.role] || '👤';
  const statusText = getStatusText(data.status);

  return `
    <div class="workload-card" data-role="${data.role}">
      <div class="workload-card-header">
        <div class="workload-card-icon">${roleIcon}</div>
        <div class="workload-card-title">
          <div class="workload-card-role">${roleName}</div>
          <div class="workload-card-subtitle">Workload Analysis</div>
        </div>
      </div>

      <div class="workload-card-stats">
        <div class="workload-stat">
          <div class="workload-stat-value">${data.usedHours}h</div>
          <div class="workload-stat-label">實際工時</div>
        </div>
        <div class="workload-stat">
          <div class="workload-stat-value">${data.taskCount}</div>
          <div class="workload-stat-label">任務數</div>
        </div>
      </div>

      <div class="workload-progress-section">
        <div class="workload-progress-header">
          <span class="workload-progress-label">負載率</span>
          <span class="workload-progress-percentage">${data.percentage}%</span>
        </div>
        <div class="workload-progress-bar-container">
          <div class="workload-progress-bar" style="width: ${data.percentage}%"></div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
        <span class="workload-status workload-status-${data.status}">
          ${statusText}
        </span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">
          ${data.totalHours}h 總工時
        </span>
      </div>
    </div>
  `;
}

/**
 * 渲染所有卡片
 */
export function renderWorkloadCards(
    period: "week" | "next_week" | "future30" | "month" = "week", 
    customAppointments?: AppointmentRecord[]
): void {
  const container = document.getElementById('staffWorkloadCards');
  if (!container) return;

  // Key Fix: Always reload full data unless custom set provided
  let dataToUse: AppointmentRecord[] = [];
  if (customAppointments) {
      dataToUse = customAppointments; // e.g. passed from Month view
  } else {
      dataToUse = dataStore.appointments; // Always fresh from Store
  }

  if (!dataToUse || dataToUse.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暫無預約資料</p>';
      return;
  }

  const workloadData = calculateWorkloadData(dataToUse, period);
  workloadData.sort((a, b) => b.percentage - a.percentage);

  const html = workloadData.map(data => renderWorkloadCard(data)).join('');
  container.innerHTML = html || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">此期間無合適資料</p>';

  // Update Note with Visual Debug Info
  const noteText = document.getElementById('workload-note-text');
  if (noteText) {
    const globalMonth = (window as any).currentDashboardMonth;
    let anchorDate = new Date();
    if (globalMonth) anchorDate = new Date(`${globalMonth}-01`);
    anchorDate.setHours(0,0,0,0);
    
    // Calculate display range again
    const currentDay = anchorDate.getDay(); 
    const distToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const thisMonday = new Date(anchorDate);
    thisMonday.setDate(anchorDate.getDate() + distToMonday);
    
    let dStart, dEnd;
    if (period === 'week') {
        dStart = new Date(thisMonday);
        dEnd = new Date(thisMonday); dEnd.setDate(dEnd.getDate() + 6);
    } else if (period === 'next_week') {
        dStart = new Date(thisMonday); dStart.setDate(dStart.getDate() + 7);
        dEnd = new Date(dStart); dEnd.setDate(dEnd.getDate() + 6);
    } else {
        dStart = new Date(anchorDate);
        dEnd = new Date(anchorDate); dEnd.setDate(dEnd.getDate() + 29);
    }
    
    const f = (d: Date) => d.toISOString().slice(0,10);
    const countTotal = workloadData.reduce((acc,cur) => acc + cur.taskCount, 0);
    const timeStr = new Date().toLocaleTimeString();
    
    noteText.innerHTML = `
        <span style="color: var(--primary-color); font-weight: bold;">目前統計範圍: ${f(dStart)} ~ ${f(dEnd)}</span>
        <span style="color: #666; margin-left: 10px;">(共 ${countTotal} 任務)</span>
        <br/>
        <span style="font-size: 0.8em; color: #999;">
        * 資料來源: Appointments (${dataToUse.length}筆) | 基準月份: ${globalMonth || '未設定(Today)'} | 更新於: ${timeStr}
        </span>
    `;
  }

  console.log(`[Workload] Render Complete (${period}). Data Size: ${workloadData.length} roles processed.`);
}

/**
 * 初始化卡片顯示
 */
export function initWorkloadCards(customAppointments?: AppointmentRecord[]): void {
  const buttons = document.querySelectorAll('[data-workload-period]');
  
  // Clean bindings (Clone Replace) to prevent multi-binding on page re-renders
  buttons.forEach(btn => {
      const newBtn = btn.cloneNode(true) as HTMLElement;
      btn.parentNode?.replaceChild(newBtn, btn);
      
      newBtn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        
        // UI Toggle
        const allBtns = document.querySelectorAll('[data-workload-period]');
        allBtns.forEach(b => b.classList.remove('active'));
        
        // Find which one was clicked in the new DOM (since we just cloned, target is correct)
        target.classList.add('active');
        
        const period = target.getAttribute('data-workload-period') as "week" | "next_week" | "future30";
        renderWorkloadCards(period);
      });
  });

  // Initial Render: Preserving active state if exists
  if (customAppointments) {
      renderWorkloadCards('month', customAppointments);
  } else {
      // Check if there is already an active button (preserved from clone)
      const activeBtn = document.querySelector('[data-workload-period].active');
      const currentPeriod = activeBtn 
          ? (activeBtn.getAttribute('data-workload-period') as "week" | "next_week" | "future30") 
          : "week";
          
      console.log(`[Workload] Re-init preserving period: ${currentPeriod}`);
      renderWorkloadCards(currentPeriod);
  }
}
