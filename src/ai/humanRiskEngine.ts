/**
 * 人力風險引擎 (Human Risk Engine)
 * 
 * 職責：
 * - 僅負責「人力負載 / 排班風險」
 * - 判斷單位：個人（staff_name）
 * - 嚴禁使用療程相關邏輯（category、executor_role、specialty）
 * 
 * 輸出：
 * - 個人過勞風險
 * - 個人負載集中風險
 * - 個人利用率偏低風險
 */

import { AppointmentRecord } from "../data/schema.js";
import { SandboxState } from "../features/sandbox/sandboxStore.js";
import { calculateBufferAnalysis } from "../logic/staff/staffBufferAnalysis.js";
import { INVOLVEMENT_RATIOS } from "../data/treatmentRatios.js";

// ===== 型別定義 =====

export interface HumanRiskInput {
  appointments: AppointmentRecord[];
  services: ServiceRecord[];
  staff: StaffRecord[];
  targetMonth: string;
  sandboxState?: SandboxState;
}

export interface ServiceRecord {
  service_name: string;
  category: string;
  duration: number;
  buffer_time: number;
}

export interface StaffRecord {
  staff_name: string;
  staff_type: string;
}

export interface HumanRiskAlert {
  type: "human";
  level: "critical" | "warning" | "normal" | "low";
  icon: string;
  staffName: string;
  staffType: string;
  summary: string;
  detail: string;
  reason: string;
  suggestion: string;
  metadata: {
    loadRate: number;
    workDays: number;
    totalHours: number;
    maxCapacity: number;
    appointmentCount: number;
  };
}

export interface HumanRiskOutput {
  summary: string[];
  details: HumanRiskAlert[];
}

// ===== 主要函數 =====

export function analyzeHumanRisks(input: HumanRiskInput): HumanRiskOutput {
  const { appointments, services, staff, targetMonth } = input;
  const alerts: HumanRiskAlert[] = [];

  // Filter Target Month Data
  const monthData = appointments.filter((a) => {
    if (!a.date.startsWith(targetMonth)) return false;
    return a.status === "completed" || a.status === "scheduled" || a.status === "confirmed";
  });

  if (monthData.length === 0) {
    return { summary: ["✅ 本月人力負載穩定"], details: [] };
  }

  // 1. Calculate Buffer Analysis for All
  const bufferStats = calculateBufferAnalysis(monthData);
  const bufferMap = new Map(bufferStats.map(s => [s.role.split(' ')[0], s])); // Name is unique key? staffBufferAnalysis returns "Name (Role)" or just check name matching


  // 2. Calculate Workload (Utilization Rate) for All
  // INVOLVEMENT_RATIOS imported from treatmentRatios.ts

  const staffWorkload: Record<string, {
    staff_name: string;
    staff_type: string;
    workDays: Set<string>;
    totalMinutes: number;
    appointmentCount: number;
  }> = {};

  monthData.forEach((appt) => {
    const staffName = appt.doctor_name || appt.staff_name;
    if (!staffName) return;
    const staffInfo = staff.find((s) => s.staff_name === staffName);
    if (!staffInfo) return;

    const service = services.find((s) => s.service_name === appt.service_item);
    // Safe duration/buffer
    const duration = service ? Number(service.duration) : 30;
    const buffer = service ? Number(service.buffer_time) : 10;
    const totalMinutes = duration + buffer;

    const category = service?.category || 'other';
    const ratios = INVOLVEMENT_RATIOS[category] || INVOLVEMENT_RATIOS['other'];
    
    let growth = 1;
    if (input.sandboxState && input.sandboxState.isActive) {
        growth = 1 + (input.sandboxState.serviceGrowth[category as keyof typeof input.sandboxState.serviceGrowth] || 0);
    }

    if (!staffWorkload[staffName]) {
      staffWorkload[staffName] = {
        staff_name: staffName,
        staff_type: staffInfo.staff_type,
        workDays: new Set(),
        totalMinutes: 0,
        appointmentCount: 0,
      };
    }
    staffWorkload[staffName].workDays.add(appt.date);
    
    const staffType = staffInfo.staff_type;
    const involvementRatio = ratios[staffType] || 0;
    
    if (involvementRatio > 0) {
      staffWorkload[staffName].totalMinutes += totalMinutes * involvementRatio * growth;
      staffWorkload[staffName].appointmentCount += 1 * growth;
    }
  });

  // 3. Strict Categorization
  Object.values(staffWorkload).forEach(s => {
      // Find matching buffer stats (Buffer logic uses "Name (Role)" format or just Name logic? 
      // staffBufferAnalysis: returns `role: "${name} (${roleType})"`
      // We need to match by name.
      const bStat = bufferStats.find(b => b.role.startsWith(s.staff_name)); // Simple prefix match
      
      // Calculate Utilization Metrics
      const dailyHours = s.staff_type === 'doctor' ? 6 : 8;
      const maxCapacityHours = s.workDays.size * dailyHours;
      const actualHours = s.totalMinutes / 60;
      const loadRate = maxCapacityHours > 0 ? Math.round((actualHours / maxCapacityHours) * 100) : 0;
      
      // Calculate Fatigue Metrics
      const compressionRate = bStat ? bStat.compressionRate : 0;
      const avgInterval = bStat ? bStat.avgGapMinutes : 15;
      const highDensityHours = bStat ? bStat.highDensityHours : 0;
      const totalGaps = bStat ? bStat.totalGaps : 0;

      // Text Logic for Interval Deviation (Role-based SOP)
      const SOP_STANDARDS: Record<string, number> = {
          doctor: 10,
          consultant: 12,
          nurse: 8,
          therapist: 10,
          other: 10
      };
      
      const roleSop = SOP_STANDARDS[s.staff_type] || 10;
      const diff = avgInterval - roleSop;
      const absDiff = Math.round(Math.abs(diff));
      
      let diffText = '';
      if (Math.abs(diff) < 1) { // Treat small decimal diffs as "Exact" or if round is 0
          diffText = `符合 SOP 標準`;
      } else if (diff > 0) {
          diffText = `高於 SOP 標準 ${absDiff} 分鐘（有緩衝）`;
      } else {
          diffText = `低於 SOP 標準 ${absDiff} 分鐘（密集）`;
      }

      // Sample Size Warning
      const sampleSizeWarning = totalGaps < 10 ? '（樣本偏少，僅供參考）' : '';
      const reasonText = `高密度連續時段：${highDensityHours.toFixed(1)} 小時｜平均服務間隔 ${diffText}${sampleSizeWarning}`;

      const metadata: any = {
          loadRate, compressionRate, 
          workDays: s.workDays.size, 
          actualHours: Math.round(actualHours*10)/10, 
          maxCapacityHours,
          appointmentCount: Math.round(s.appointmentCount),
          avgInterval,
          highDensityHours
      };

      let isFatigue = false;
      const isSim = input.sandboxState && input.sandboxState.isActive;

      // === Priority 1: Fatigue Risk (🔥) ===
      if (compressionRate >= 70) {
          // High Risk Overload -> Must Show
          isFatigue = true;
          alerts.push({
              type: "human", level: "critical", icon: "🔥",
              staffName: s.staff_name, staffType: s.staff_type,
              summary: `${s.staff_name} 高風險過勞 (Fatigue)`,
              detail: `壓縮率 ${compressionRate}%｜已達 Burnout 高風險區`,
              reason: reasonText,
              suggestion: "立即強制介入休息，或下修該員工業績目標",
              metadata
          });
      } else if (compressionRate >= 50) {
          // Obvious Fatigue -> Show
          isFatigue = true;
          alerts.push({
              type: "human", level: "warning", icon: "🔥",
              staffName: s.staff_name, staffType: s.staff_type,
              summary: `${s.staff_name} 明顯疲勞 (Fatigue)`,
              detail: `壓縮率 ${compressionRate}%｜疲勞已可感知`,
              reason: reasonText,
              suggestion: "建議安排行政時段作為緩衝",
              metadata
          });
      } else if (compressionRate >= 30) {
          // Hidden Fatigue (Conditional)
          const trigger1 = avgInterval < 15;
          const trigger2 = highDensityHours >= 2;
          const trigger3 = isSim; 
          
          if (trigger1 || trigger2 || trigger3) {
             isFatigue = true;
             alerts.push({
                  type: "human", level: "warning", icon: "🔥",
                  staffName: s.staff_name, staffType: s.staff_type,
                  summary: `${s.staff_name} 隱性疲勞風險 (Hidden)`,
                  detail: `壓縮率 ${compressionRate}%｜符合二階觸發條件`,
                  reason: `觸發：${trigger1 ? '平均間隔過短' : trigger2 ? '連續高密度工時' : '模擬壓力測試'}`,
                  suggestion: "雖未達過勞門檻，但建議預防性調整排班",
                  metadata
             }); 
          }
      }

      // === Priority 2: Utilization Risk (🧊) === (Exclusive)
      if (!isFatigue) {
          if (loadRate < 40) {
             alerts.push({
                  type: "human", level: "low", icon: "🧊",
                  staffName: s.staff_name, staffType: s.staff_type,
                  summary: `${s.staff_name} 人力利用率偏低`,
                  detail: `負載率 ${loadRate}%｜明顯偏低`,
                  reason: `本月實際工時 ${Math.round(actualHours)} / ${maxCapacityHours} 小時｜執行案件數 ${Math.round(s.appointmentCount)}`,
                  suggestion: "建議增加導流或安排教育訓練",
                  metadata
             });
          } else if (loadRate < 70) {
             alerts.push({
                  type: "human", level: "warning", icon: "🧊",
                  staffName: s.staff_name, staffType: s.staff_type,
                  summary: `${s.staff_name} 人力利用率偏低 (觀察)`,
                  detail: `負載率 ${loadRate}%｜位於觀察區間`,
                  reason: `本月實際工時 ${Math.round(actualHours)} / ${maxCapacityHours} 小時`,
                  suggestion: "視管理需求調整排班密度",
                  metadata
             });
          }
      }
  });

  // Sort: Critical > Warning > Low
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, normal: 2, low: 3 };
    return order[a.level] - order[b.level];
  });

  // Generate Summary
  const summary = generateHumanSummary(alerts);
  return { summary, details: alerts };
}

// ===== 輔助函數 =====

function generateHumanSummary(alerts: HumanRiskAlert[]): string[] {
  if (alerts.length === 0) {
    return ["✅ 本月人力配置健康，無顯著風險"];
  }

  const fatigueCount = alerts.filter(a => a.icon === "🔥").length;
  const utilCount = alerts.filter(a => a.icon === "🧊").length;
  
  const summary: string[] = [];
  if (fatigueCount > 0) summary.push(`🔥 ${fatigueCount} 位與人員存在疲勞/隱性疲勞風險`);
  if (utilCount > 0) summary.push(`🧊 ${utilCount} 位人員人力利用率有優化空間`);

  return summary;
}
