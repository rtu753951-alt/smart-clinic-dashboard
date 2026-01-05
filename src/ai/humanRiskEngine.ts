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

  // 篩選本月資料（completed + 未來已預約）
  const monthData = appointments.filter((a) => {
    if (!a.date.startsWith(targetMonth)) return false;
    return a.status === "completed" || a.status === "scheduled" || a.status === "confirmed";
  });

  if (monthData.length === 0) {
    return {
      summary: ["✅ 本月人力負載穩定"],
      details: [],
    };
  }

  // Doctor involvement ratio model with consultation role split
  const INVOLVEMENT_RATIOS: Record<string, Record<string, number>> = {
    inject: { doctor: 0.35, therapist: 0, nurse: 0.6, consultant: 0 },
    rf: { doctor: 0.35, therapist: 0, nurse: 0.4, consultant: 0 },
    laser: { doctor: 0.15, therapist: 1.0, nurse: 0.2, consultant: 0 },
    drip: { doctor: 0.10, therapist: 0, nurse: 1.0, consultant: 0 },
    consult: { doctor: 0.30, therapist: 0, nurse: 0, consultant: 0.70 }
  };

  // 按個人統計工作負載
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

    // 查詢療程時間（僅用於計算工時，不涉及療程邏輯）
    const service = services.find((s) => s.service_name === appt.service_item);
    const duration = service ? service.duration : 30;
    const buffer = service ? service.buffer_time : 10;
    const totalMinutes = duration + buffer;

    // Get service category to determine involvement ratios
    const category = service?.category || 'inject';
    const ratios = INVOLVEMENT_RATIOS[category] || INVOLVEMENT_RATIOS['inject'];

    // Sandbox Growth
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
    
    // Apply involvement ratio based on staff type and service category
    const staffType = staffInfo.staff_type;
    const involvementRatio = ratios[staffType] || 0;
    
    if (involvementRatio > 0) {
      staffWorkload[staffName].totalMinutes += totalMinutes * involvementRatio * growth;
      staffWorkload[staffName].appointmentCount += 1 * growth;
    }
  });

  console.log("👤 個人工作負載分析:", Object.values(staffWorkload).map(s => ({
    name: s.staff_name,
    type: s.staff_type,
    days: s.workDays.size,
    hours: Math.round(s.totalMinutes / 60 * 10) / 10,
    count: s.appointmentCount,
  })));

  // 計算每個人的負載率
  Object.values(staffWorkload).forEach((staffData) => {
    const workDays = staffData.workDays.size;
    const totalHours = staffData.totalMinutes / 60;
    
    // Doctor available medical hours: 6 hours/day (conservative estimate)
    // Other roles: 8 hours/day
    const dailyHours = staffData.staff_type === 'doctor' ? 6 : 8;
    const maxCapacity = workDays * dailyHours;
    const loadRate = Math.round((totalHours / maxCapacity) * 100);

    console.log(`  ${staffData.staff_name} (${staffData.staff_type}):`, {
      workDays,
      totalHours: Math.round(totalHours * 10) / 10,
      maxCapacity,
      loadRate: `${loadRate}%`,
    });

    const metadata = {
      loadRate,
      workDays,
      totalHours: Math.round(totalHours * 10) / 10,
      maxCapacity,
      appointmentCount: staffData.appointmentCount,
    };

    // 🔴 高風險：≥ 90%
    if (loadRate >= 90) {
      alerts.push({
        type: "human",
        level: "critical",
        icon: "🔴",
        staffName: staffData.staff_name,
        staffType: staffData.staff_type,
        summary: `${staffData.staff_name}（${staffData.staff_type}）人力負載過高`,
        detail: `${staffData.staff_name} 本月負載率達 ${loadRate}%，已接近或超過可承受上限`,
        reason: `工作天數：${workDays} 天｜執行療程：${staffData.appointmentCount} 次｜實際工時：${Math.round(totalHours)} / ${maxCapacity} 小時`,
        suggestion: "建議調整未來兩週排班，分流部分高工時療程至其他人員，或增加休息時段",
        metadata,
      });
    }
    // 🟠 中風險：70-89%
    else if (loadRate >= 70) {
      alerts.push({
        type: "human",
        level: "warning",
        icon: "🟠",
        staffName: staffData.staff_name,
        staffType: staffData.staff_type,
        summary: `${staffData.staff_name}（${staffData.staff_type}）人力負載偏高`,
        detail: `${staffData.staff_name} 本月負載率為 ${loadRate}%，接近高檔`,
        reason: `工作天數：${workDays} 天｜執行療程：${staffData.appointmentCount} 次｜實際工時：${Math.round(totalHours)} / ${maxCapacity} 小時`,
        suggestion: "建議持續觀察，必要時調整排班或引導部分療程至其他時段",
        metadata,
      });
    }
    // 🔵 低利用：< 30%
    else if (loadRate < 30 && workDays > 0) {
      alerts.push({
        type: "human",
        level: "low",
        icon: "🔵",
        staffName: staffData.staff_name,
        staffType: staffData.staff_type,
        summary: `${staffData.staff_name}（${staffData.staff_type}）人力利用率偏低`,
        detail: `${staffData.staff_name} 本月負載率僅 ${loadRate}%，明顯偏低`,
        reason: `工作天數：${workDays} 天｜執行療程：${staffData.appointmentCount} 次｜實際工時：${Math.round(totalHours)} / ${maxCapacity} 小時`,
        suggestion: "建議評估是否調整排班、增加導流，或安排教育訓練與內部優化",
        metadata,
      });
    }
  });

  // Calculate Buffer Compression Risks using shared logic
  const bufferStats = calculateBufferAnalysis(monthData); // Use filtered month data

  bufferStats.forEach(stat => {
      // 🔴 結構性崩潰風險：壓縮率 > 70%
      if (stat.compressionRate > 70) {
          alerts.push({
              type: "human",
              level: "critical",
              icon: "☣️", 
              staffName: stat.role, 
              staffType: "mixed",
              summary: `${stat.role} 結構性崩潰風險`,
              detail: `模擬顯示服務間隔壓縮率達 ${stat.compressionRate}%（>70%），極度危險`,
              reason: `平均間隔僅 ${stat.avgGapMinutes} 分鐘，遠低於標準。身心耗竭(Burnout)風險極高。`,
              suggestion: "立即下修該員工業績目標，或增派 1-2 名助理協助轉場與術後衛教。",
              metadata: { loadRate: stat.compressionRate } as any
          });
      }
      // 🟠 隱性疲勞風險：壓縮率 > 30%
      else if (stat.compressionRate > 30) {
          alerts.push({
              type: "human",
              level: "warning",
              icon: "⏱️",
              staffName: stat.role,
              staffType: "mixed",
              summary: `${stat.role} 隱性疲勞風險`,
              detail: `服務間隔壓縮率 ${stat.compressionRate}%，高頻切換易導致認知疲勞`,
              reason: `平均間隔 ${stat.avgGapMinutes} 分鐘。雖工時可能未滿，但心理壓力強度大。`,
              suggestion: "建議在連續排程中強制插入 10 分鐘緩衝，或安排行政時段。",
              metadata: { loadRate: stat.compressionRate } as any
          });
      }
  });

  // 按風險等級排序：critical > warning > low
  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, normal: 2, low: 3 };
    return order[a.level] - order[b.level];
  });

  // 生成摘要
  const summary = generateHumanSummary(alerts);

  return { summary, details: alerts };
}

// ===== 輔助函數 =====

function generateHumanSummary(alerts: HumanRiskAlert[]): string[] {
  if (alerts.length === 0) {
    return ["✅ 本月人力負載穩定"];
  }

  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const warningCount = alerts.filter((a) => a.level === "warning").length;
  const lowCount = alerts.filter((a) => a.level === "low").length;

  const summary: string[] = [];

  if (criticalCount > 0) {
    summary.push(`🔴 ${criticalCount} 位人員本月負載超過 90%，存在過載風險`);
  }
  if (warningCount > 0) {
    summary.push(`🟠 ${warningCount} 位人員本月負載偏高（70-89%），需持續觀察`);
  }
  if (lowCount > 0) {
    summary.push(`🔵 ${lowCount} 位人員利用率偏低，可調整導流策略`);
  }

  return summary.slice(0, 3);
}
