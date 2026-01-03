/**
 * Churn Risk Selector
 * 流失風險選擇器
 * 
 * 規則：
 * - high: 90 天未回診
 * - medium: 60-90 天未回診
 * - low: 60 天內有回診
 */

import type { Customer } from '../types/customer.js';
import type { ChurnRiskLevel, ChurnRiskResult } from '../types/churn.js';

/**
 * 計算流失風險等級
 */
export function calculateChurnRisk(customer: Customer): ChurnRiskResult {
  const today = new Date();
  const lastVisit = new Date(customer.lastVisitDate);
  const daysSinceLastVisit = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));

  let risk: ChurnRiskLevel;
  let reason: string;

  if (daysSinceLastVisit >= 90) {
    risk = 'high';
    reason = `已 ${daysSinceLastVisit} 天未回診，流失風險高`;
  } else if (daysSinceLastVisit >= 60) {
    risk = 'medium';
    reason = `已 ${daysSinceLastVisit} 天未回診，建議主動關懷`;
  } else {
    risk = 'low';
    reason = `${daysSinceLastVisit} 天前有回診，狀態穩定`;
  }

  return {
    customerId: customer.id,
    risk,
    reason
  };
}

/**
 * 分析所有顧客的流失風險
 */
export function selectChurnRisks(customers: Customer[]): ChurnRiskResult[] {
  return customers.map(customer => calculateChurnRisk(customer));
}

/**
 * 篩選高風險顧客
 */
export function selectHighRiskCustomers(customers: Customer[]): ChurnRiskResult[] {
  return selectChurnRisks(customers).filter(result => result.risk === 'high');
}

/**
 * 依風險等級分組
 */
export function selectChurnRisksByLevel(customers: Customer[]): Record<ChurnRiskLevel, ChurnRiskResult[]> {
  const risks = selectChurnRisks(customers);
  
  const grouped: Record<ChurnRiskLevel, ChurnRiskResult[]> = {
    high: [],
    medium: [],
    low: []
  };

  risks.forEach(risk => {
    grouped[risk.risk].push(risk);
  });

  return grouped;
}
