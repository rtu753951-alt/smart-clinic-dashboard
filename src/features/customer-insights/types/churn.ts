/**
 * Churn Risk Types
 * 流失風險型別定義
 */

export type ChurnRiskLevel = 'low' | 'medium' | 'high';

export type ChurnRiskResult = {
  customerId: string;
  risk: ChurnRiskLevel;
  reason: string;
};
