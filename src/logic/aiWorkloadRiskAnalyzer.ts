/**
 * AI 人力負荷與營運風險分析模組
 * 
 * 專注於：病人安全、服務品質、員工過勞預防
 * 避免：績效評比、效率排名、人員批評
 */

import { AppointmentRecord } from "../data/schema.js";

export interface ServiceInfo {
  service_name: string;
  duration: number;
  buffer_time: number;
  intensity_level: 'low' | 'medium' | 'high';
  transferable: 'yes' | 'no' | 'limited';
}

export interface WorkloadRiskReport {
  summary: string[];                    // 本週風險摘要 (3-5行)
  riskFindings: RiskFinding[];          // 風險發現 (最多5點)
  actionableAdjustments: string[];      // 立即可做的調整建議 (3-6點)
  manualReviewList: ManualReviewItem[]; // 需要人工確認的清單 (最多8條)
  friendlyReminder: string;             // 對員工友善的提醒文案 (1-2行)
}

export interface RiskFinding {
  riskType: string;           // 風險類型
  occurrences: string;        // 發生在哪些日期/時段
  reason: string;             // 為何判定
  severity: 'yellow' | 'red'; // 風險等級
}

export interface ManualReviewItem {
  date: string;
  timeSlot: string;
  staffRole: string;
  serviceType: string;
  reason: string;
}

interface StaffWorkload {
  staffName: string;
  role: string;
  dailyWorkload: Map<string, {
    totalMinutes: number;
    highIntensityMinutes: number;
    consecutiveHighMinutes: number;
    comboCount: number;
    totalCount: number;
    appointments: AppointmentRecord[];
  }>;
}

/**
 * 生成本週工作負荷風險分析報告
 */
export function generateWorkloadRiskReport(
  appointments: AppointmentRecord[],
  services: ServiceInfo[]
): WorkloadRiskReport {
  
  // 建立服務資訊查詢表
  const serviceMap = new Map<string, ServiceInfo>();
  services.forEach(s => serviceMap.set(s.service_name, s));
  
  // 取得本週日期範圍
  const weekRange = getCurrentWeekRange();
  
  // 過濾本週的有效預約 (booked, checked_in, completed)
  const weekAppointments = appointments.filter(apt => {
    if (!apt.date || !apt.status) return false;
    const aptDate = new Date(apt.date);
    const status = apt.status.toLowerCase();
    return aptDate >= weekRange.start && 
           aptDate <= weekRange.end &&
           (status === 'booked' || status === 'checked_in' || status === 'completed');
  });
  
  // 分析每位員工的工作負荷
  const staffWorkloads = analyzeStaffWorkloads(weekAppointments, serviceMap);
  
  // 識別風險
  const riskFindings = identifyRisks(staffWorkloads, weekAppointments);
  
  // 生成摘要
  const summary = generateRiskSummary(riskFindings, weekAppointments.length);
  
  // 生成調整建議
  const actionableAdjustments = generateActionableAdjustments(riskFindings);
  
  // 生成人工確認清單
  const manualReviewList = generateManualReviewList(staffWorkloads, weekAppointments, serviceMap);
  
  // 生成友善提醒
  const friendlyReminder = generateFriendlyReminder(riskFindings);
  
  return {
    summary,
    riskFindings,
    actionableAdjustments,
    manualReviewList,
    friendlyReminder
  };
}

/**
 * 取得本週日期範圍 (週一到週日)
 */
function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 調整到週一
  
  const start = new Date(now);
  start.setDate(now.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * 分析每位員工的工作負荷
 */
function analyzeStaffWorkloads(
  appointments: AppointmentRecord[],
  serviceMap: Map<string, ServiceInfo>
): StaffWorkload[] {
  
  const staffMap = new Map<string, StaffWorkload>();
  
  appointments.forEach(apt => {
    const staffName = apt.doctor_name || '未指定';
    const role = apt.staff_role || 'unknown';
    const date = apt.date || '';
    
    if (!staffMap.has(staffName)) {
      staffMap.set(staffName, {
        staffName,
        role,
        dailyWorkload: new Map()
      });
    }
    
    const staff = staffMap.get(staffName)!;
    
    if (!staff.dailyWorkload.has(date)) {
      staff.dailyWorkload.set(date, {
        totalMinutes: 0,
        highIntensityMinutes: 0,
        consecutiveHighMinutes: 0,
        comboCount: 0,
        totalCount: 0,
        appointments: []
      });
    }
    
    const dayWorkload = staff.dailyWorkload.get(date)!;
    dayWorkload.appointments.push(apt);
    dayWorkload.totalCount++;
    
    const aptAny = apt as any;
    const serviceItems = (aptAny.service_items || apt.service_item || '').split(';').filter((s: string) => s.trim());
    let totalDuration = 0;
    let totalBuffer = 0;
    let intensity: string = 'low'; // 改為 string 類型以避免類型比較錯誤
    
    // 檢查是否為複合療程
    const isCombo = serviceItems.length >= 2 || aptAny.case_flag === 'combo';
    if (isCombo) {
      dayWorkload.comboCount++;
    }
    
    // 計算總時長與強度
    serviceItems.forEach((item: string) => {
      const service = serviceMap.get(item.trim());
      if (service) {
        totalDuration += service.duration;
        totalBuffer += service.buffer_time;
        
        // 使用 focus_override 或 service intensity
        const itemIntensity = aptAny.focus_override || service.intensity_level;
        if (itemIntensity === 'high') intensity = 'high';
        else if (itemIntensity === 'medium' && intensity !== 'high') intensity = 'medium';
      }
    });
    
    const workMinutes = totalDuration + totalBuffer;
    dayWorkload.totalMinutes += workMinutes;
    
    if (intensity === 'high') {
      dayWorkload.highIntensityMinutes += workMinutes;
    }
  });
  
  // 計算連續高強度時間
  staffMap.forEach(staff => {
    staff.dailyWorkload.forEach((dayWorkload, date) => {
      const sorted = dayWorkload.appointments.sort((a, b) => {
        const timeA = a.time || '00:00:00';
        const timeB = b.time || '00:00:00';
        return timeA.localeCompare(timeB);
      });
      
      let consecutiveHigh = 0;
      let lastEndTime: Date | null = null;
      
      sorted.forEach(apt => {
        const aptAny = apt as any;
        const serviceItems = (aptAny.service_items || apt.service_item || '').split(';').filter((s: string) => s.trim());
        const intensity = aptAny.focus_override || getServiceIntensity(serviceItems[0], serviceMap);
        
        if (intensity === 'high') {
          const aptTime = parseDateTime(date, apt.time || '00:00:00');
          const duration = calculateDuration(serviceItems, serviceMap);
          const endTime = new Date(aptTime.getTime() + duration * 60000);
          
          if (lastEndTime && (aptTime.getTime() - lastEndTime.getTime()) < 15 * 60000) {
            // 間隔小於15分鐘，視為連續
            consecutiveHigh += duration;
          } else {
            consecutiveHigh = duration;
          }
          
          lastEndTime = endTime;
          dayWorkload.consecutiveHighMinutes = Math.max(dayWorkload.consecutiveHighMinutes, consecutiveHigh);
        } else {
          consecutiveHigh = 0;
          lastEndTime = null;
        }
      });
    });
  });
  
  return Array.from(staffMap.values());
}

/**
 * 識別風險
 */
function identifyRisks(
  staffWorkloads: StaffWorkload[],
  appointments: AppointmentRecord[]
): RiskFinding[] {
  
  const findings: RiskFinding[] = [];
  
  // 1. 連續高強度風險
  staffWorkloads.forEach(staff => {
    staff.dailyWorkload.forEach((dayWorkload, date) => {
      if (dayWorkload.consecutiveHighMinutes >= 180) {
        findings.push({
          riskType: '連續高強度風險',
          occurrences: `${formatDate(date)} ${staff.staffName}（${staff.role}）`,
          reason: `連續高強度療程達 ${dayWorkload.consecutiveHighMinutes} 分鐘，建議插入休息緩衝`,
          severity: 'red'
        });
      } else if (dayWorkload.consecutiveHighMinutes >= 120) {
        findings.push({
          riskType: '連續高強度風險',
          occurrences: `${formatDate(date)} ${staff.staffName}（${staff.role}）`,
          reason: `連續高強度療程達 ${dayWorkload.consecutiveHighMinutes} 分鐘，需注意疲勞累積`,
          severity: 'yellow'
        });
      }
    });
  });
  
  // 2. 複合療程擁擠風險
  staffWorkloads.forEach(staff => {
    staff.dailyWorkload.forEach((dayWorkload, date) => {
      const comboRatio = dayWorkload.totalCount > 0 
        ? (dayWorkload.comboCount / dayWorkload.totalCount) * 100 
        : 0;
      
      if (comboRatio >= 45) {
        findings.push({
          riskType: '複合療程擁擠風險',
          occurrences: `${formatDate(date)} ${staff.staffName}（${staff.role}）`,
          reason: `複合療程佔比 ${comboRatio.toFixed(0)}%，可能影響服務品質與專注度`,
          severity: 'red'
        });
      } else if (dayWorkload.comboCount >= 3 || comboRatio >= 35) {
        findings.push({
          riskType: '複合療程擁擠風險',
          occurrences: `${formatDate(date)} ${staff.staffName}（${staff.role}）`,
          reason: `複合療程 ${dayWorkload.comboCount} 筆（佔比 ${comboRatio.toFixed(0)}%），建議分散排程`,
          severity: 'yellow'
        });
      }
    });
  });
  
  // 3. 高波動風險（取消/爽約）
  const timeSlotVolatility = analyzeTimeSlotVolatility(appointments);
  timeSlotVolatility.forEach(slot => {
    if (slot.cancelRatio >= 0.30) {
      findings.push({
        riskType: '高波動風險（取消/爽約）',
        occurrences: `${slot.timeSlot} 時段`,
        reason: `取消+爽約比例達 ${(slot.cancelRatio * 100).toFixed(0)}%，建議採取二次確認或候補機制`,
        severity: 'red'
      });
    } else if (slot.cancelRatio >= 0.20) {
      findings.push({
        riskType: '高波動風險（取消/爽約）',
        occurrences: `${slot.timeSlot} 時段`,
        reason: `取消+爽約比例達 ${(slot.cancelRatio * 100).toFixed(0)}%，需留意排程穩定性`,
        severity: 'yellow'
      });
    }
  });
  
  return findings;
}

/**
 * 分析時段波動性
 */
function analyzeTimeSlotVolatility(appointments: AppointmentRecord[]): Array<{
  timeSlot: string;
  total: number;
  cancelled: number;
  cancelRatio: number;
}> {
  
  const slots = new Map<string, { total: number; cancelled: number }>();
  
  appointments.forEach(apt => {
    const time = apt.time || '00:00:00';
    const hour = parseInt(time.split(':')[0]);
    let slot = '';
    
    if (hour >= 14 && hour < 18) {
      slot = '14:00-18:00';
    } else if (hour >= 18 && hour < 21) {
      slot = '18:00-21:00';
    } else {
      return; // 只分析下午和晚上時段
    }
    
    if (!slots.has(slot)) {
      slots.set(slot, { total: 0, cancelled: 0 });
    }
    
    const slotData = slots.get(slot)!;
    slotData.total++;
    
    const status = (apt.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'no_show') {
      slotData.cancelled++;
    }
  });
  
  return Array.from(slots.entries()).map(([timeSlot, data]) => ({
    timeSlot,
    total: data.total,
    cancelled: data.cancelled,
    cancelRatio: data.total > 0 ? data.cancelled / data.total : 0
  }));
}

/**
 * 生成風險摘要
 */
function generateRiskSummary(findings: RiskFinding[], totalAppointments: number): string[] {
  const summary: string[] = [];
  
  const redCount = findings.filter(f => f.severity === 'red').length;
  const yellowCount = findings.filter(f => f.severity === 'yellow').length;
  
  if (redCount > 0) {
    summary.push(`⚠️ 本週發現 ${redCount} 項紅色風險，需優先處理以保護服務品質與員工健康`);
  } else if (yellowCount > 0) {
    summary.push(`⚡ 本週發現 ${yellowCount} 項黃色風險，建議適度調整以預防問題升級`);
  } else {
    summary.push(`✅ 本週整體負載分佈良好，未發現顯著風險`);
  }
  
  const highIntensityRisks = findings.filter(f => f.riskType === '連續高強度風險');
  if (highIntensityRisks.length > 0) {
    summary.push(`🔥 ${highIntensityRisks.length} 個時段出現連續高強度負載集中，建議插入緩衝時間`);
  }
  
  const comboRisks = findings.filter(f => f.riskType === '複合療程擁擠風險');
  if (comboRisks.length > 0) {
    summary.push(`📦 ${comboRisks.length} 個時段複合療程比例偏高，建議分散排程以維持專注度`);
  }
  
  const volatilityRisks = findings.filter(f => f.riskType === '高波動風險（取消/爽約）');
  if (volatilityRisks.length > 0) {
    summary.push(`📞 部分時段取消率偏高，建議加強預約確認機制`);
  }
  
  if (summary.length === 1 && redCount === 0 && yellowCount === 0) {
    summary.push(`本週共 ${totalAppointments} 筆預約，負載分佈平均，適合維持現有排程模式`);
  }
  
  return summary;
}

/**
 * 生成可執行的調整建議
 */
function generateActionableAdjustments(findings: RiskFinding[]): string[] {
  const adjustments: string[] = [];
  
  const highIntensityRisks = findings.filter(f => f.riskType === '連續高強度風險');
  if (highIntensityRisks.length > 0) {
    adjustments.push('在連續高強度療程之間插入 10-20 分鐘休息緩衝，目的：避免疲勞累積、維持服務品質');
    adjustments.push('將可轉移的低/中強度項目調整至非高峰時段，目的：平衡負載分佈');
  }
  
  const comboRisks = findings.filter(f => f.riskType === '複合療程擁擠風險');
  if (comboRisks.length > 0) {
    adjustments.push('將部分複合療程分散至其他日期或時段，目的：降低單日複雜度、提升專注力');
    adjustments.push('優先安排單一療程填補空檔，避免複合療程過度集中，目的：風險分散');
  }
  
  const volatilityRisks = findings.filter(f => f.riskType === '高波動風險（取消/爽約）');
  if (volatilityRisks.length > 0) {
    adjustments.push('對高波動時段採取預約前一日二次確認，目的：降低臨時取消率');
    adjustments.push('建立候補名單機制，當有取消時可快速遞補，目的：提升資源利用穩定性');
  }
  
  if (adjustments.length === 0) {
    adjustments.push('維持現有排程模式，持續觀察負載變化');
    adjustments.push('可考慮將成功經驗（如負載平衡、緩衝時間設定）標準化');
  }
  
  return adjustments.slice(0, 6); // 最多6點
}

/**
 * 生成人工確認清單
 */
function generateManualReviewList(
  staffWorkloads: StaffWorkload[],
  appointments: AppointmentRecord[],
  serviceMap: Map<string, ServiceInfo>
): ManualReviewItem[] {
  
  const reviewList: ManualReviewItem[] = [];
  
  staffWorkloads.forEach(staff => {
    staff.dailyWorkload.forEach((dayWorkload, date) => {
      // 高強度連續排程
      if (dayWorkload.consecutiveHighMinutes >= 120) {
        reviewList.push({
          date: formatDate(date),
          timeSlot: '全日',
          staffRole: staff.role,
          serviceType: '高強度療程',
          reason: `連續 ${dayWorkload.consecutiveHighMinutes} 分鐘，建議插入休息`
        });
      }
      
      // 複合療程集中
      if (dayWorkload.comboCount >= 3) {
        reviewList.push({
          date: formatDate(date),
          timeSlot: '全日',
          staffRole: staff.role,
          serviceType: '複合療程',
          reason: `${dayWorkload.comboCount} 筆複合療程，建議分散`
        });
      }
    });
  });
  
  return reviewList.slice(0, 8); // 最多8條
}

/**
 * 生成友善提醒
 */
function generateFriendlyReminder(findings: RiskFinding[]): string {
  if (findings.some(f => f.severity === 'red')) {
    return '💙 本分析目的是保護團隊健康與服務品質，非評比個人表現。建議優先處理紅色風險項目，確保安全與永續營運。';
  } else if (findings.some(f => f.severity === 'yellow')) {
    return '💚 本分析旨在預防過勞與維持品質，建議適度調整黃色風險項目，讓團隊在最佳狀態下服務客戶。';
  } else {
    return '✨ 本週負載分佈良好！持續維持合理排程，讓團隊在健康與品質之間取得平衡。';
  }
}

// ===== 輔助函數 =====

function getServiceIntensity(serviceName: string, serviceMap: Map<string, ServiceInfo>): 'low' | 'medium' | 'high' {
  const service = serviceMap.get(serviceName.trim());
  return service?.intensity_level || 'low';
}

function calculateDuration(serviceItems: string[], serviceMap: Map<string, ServiceInfo>): number {
  let total = 0;
  serviceItems.forEach(item => {
    const service = serviceMap.get(item.trim());
    if (service) {
      total += service.duration + service.buffer_time;
    }
  });
  return total;
}

function parseDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[date.getDay()];
  return `${month}/${day}（${weekday}）`;
}
