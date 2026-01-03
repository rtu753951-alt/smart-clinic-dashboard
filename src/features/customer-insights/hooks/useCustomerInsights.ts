/**
 * useCustomerInsights Hook
 * 顧客洞察資料 Hook
 * 
 * 職責：
 * - 呼叫 selectors
 * - 組合成單一 object
 * - 不直接存取 UI
 */

import type { Customer } from '../types/customer.js';
import type { RFMSegment } from '../types/rfm.js';
import type { ChurnRiskResult } from '../types/churn.js';

import { selectNewCustomers, selectReturningCustomers } from '../selectors/customerBaseSelector.js';
import { selectCustomersByRFM } from '../selectors/rfmSelector.js';
import { selectChurnRisks } from '../selectors/churnRiskSelector.js';

export interface CustomerInsightsData {
  newCustomers: Customer[];
  returningCustomers: Customer[];
  rfmSegments: Record<RFMSegment, Customer[]>;
  churnRisks: ChurnRiskResult[];
}

/**
 * 取得顧客洞察資料
 */
export function useCustomerInsights(customers: Customer[]): CustomerInsightsData {
  // 新客與回診客
  const newCustomers = selectNewCustomers(customers);
  const returningCustomers = selectReturningCustomers(customers);

  // RFM 分群
  const rfmSegments = selectCustomersByRFM(customers);

  // 流失風險
  const churnRisks = selectChurnRisks(customers);

  return {
    newCustomers,
    returningCustomers,
    rfmSegments,
    churnRisks
  };
}
