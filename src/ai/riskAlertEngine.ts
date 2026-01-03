/**
 * AI 風險預警引擎 - 整合層
 * 
 * 職責：
 * - 整合 HumanRiskEngine 和 ServiceRiskEngine 的輸出
 * - 提供統一的介面給 UI 層
 * - 不包含任何風險判斷邏輯
 */

import { analyzeHumanRisks, HumanRiskInput, HumanRiskAlert } from "./humanRiskEngine.js";
import { analyzeServiceRisks, ServiceRiskInput, ServiceRiskAlert } from "./serviceRiskEngine.js";
import { AppointmentRecord } from "../data/schema.js";

// ===== 型別定義 =====

export interface RiskAlertInput {
  appointments: AppointmentRecord[];
  services: any[];
  staff: any[];
  targetMonth: string;
}

export interface RiskAlert {
  type: "staff" | "service";
  level: "critical" | "warning" | "normal" | "low";
  icon: string;
  summary: string;
  detail: string;
  reason: string;
  suggestion: string;
  metadata?: any;
}

export interface RiskAlertOutput {
  summary: string[];
  details: RiskAlert[];
}

// ===== 主要函數 =====

export function generateRiskAlerts(input: RiskAlertInput): RiskAlertOutput {
  // 1️⃣ 分析人力風險
  const humanRiskInput: HumanRiskInput = {
    appointments: input.appointments,
    services: input.services,
    staff: input.staff,
    targetMonth: input.targetMonth,
  };
  const humanRisks = analyzeHumanRisks(humanRiskInput);

  // 2️⃣ 分析療程風險
  const serviceRiskInput: ServiceRiskInput = {
    appointments: input.appointments,
    services: input.services,
    staff: input.staff,
    targetMonth: input.targetMonth,
  };
  const serviceRisks = analyzeServiceRisks(serviceRiskInput);

  // 3️⃣ 整合結果並按風險等級排序
  const allAlerts: RiskAlert[] = [
    ...humanRisks.details.map(convertHumanAlert),
    ...serviceRisks.details.map(convertServiceAlert),
  ];

  // 按風險等級排序：critical > warning > normal > low
  allAlerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, normal: 2, low: 3 };
    return order[a.level] - order[b.level];
  });

  // 4️⃣ 生成整合摘要（取前 4 個最高風險）
  const summary = allAlerts.slice(0, 4).map(alert => `${alert.icon} ${alert.summary}`);

  return {
    summary: summary.length > 0 ? summary : ["✅ 目前營運狀況穩定，未偵測到明顯風險"],
    details: allAlerts,
  };
}

// ===== 轉換函數 =====

function convertHumanAlert(alert: HumanRiskAlert): RiskAlert {
  return {
    type: "staff",
    level: alert.level,
    icon: alert.icon,
    summary: alert.summary,
    detail: alert.detail,
    reason: alert.reason,
    suggestion: alert.suggestion,
    metadata: alert.metadata,
  };
}

function convertServiceAlert(alert: ServiceRiskAlert): RiskAlert {
  return {
    type: "service",
    level: alert.level,
    icon: alert.icon,
    summary: alert.summary,
    detail: alert.detail,
    reason: alert.reason,
    suggestion: alert.suggestion,
    metadata: alert.metadata,
  };
}
