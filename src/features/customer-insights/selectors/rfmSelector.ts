/**
 * RFM Selector
 * RFM 分析選擇器
 * 
 * 規則：
 * - Recency: 距離今天天數（簡單差值）
 * - Frequency: 使用 totalVisits
 * - Monetary: 使用 totalSpend
 * - high_value: F >= 5 且 M >= 平均
 * - medium_value: 介於中間
 * - low_value: 其餘
 */

import type { Customer } from '../types/customer.js';
import type { RFMScore, RFMSegment } from '../types/rfm.js';

/**
 * 計算 RFM 分數
 */
export function calculateRFMScore(customer: Customer): RFMScore {
  // Recency: 距離今天的天數
  const today = new Date();
  const lastVisit = new Date(customer.lastVisitDate);
  const daysDiff = Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    recency: daysDiff,
    frequency: customer.totalVisits,
    monetary: customer.totalSpend
  };
}

/**
 * 判斷 RFM 區段
 */
export function determineRFMSegment(customer: Customer, avgMonetary: number): RFMSegment {
  const score = calculateRFMScore(customer);
  
  // high_value: F >= 5 且 M >= 平均
  if (score.frequency >= 5 && score.monetary >= avgMonetary) {
    return 'high_value';
  }
  
  // low_value: F < 3 或 M < 平均的一半
  if (score.frequency < 3 || score.monetary < avgMonetary * 0.5) {
    return 'low_value';
  }
  
  // medium_value: 其餘
  return 'medium_value';
}

/**
 * 分類所有顧客的 RFM 區段
 */
export function selectCustomersByRFM(customers: Customer[]): Record<RFMSegment, Customer[]> {
  if (customers.length === 0) {
    return {
      high_value: [],
      medium_value: [],
      low_value: []
    };
  }

  // 計算平均消費金額
  const totalSpend = customers.reduce((sum, c) => sum + c.totalSpend, 0);
  const avgMonetary = totalSpend / customers.length;

  const segments: Record<RFMSegment, Customer[]> = {
    high_value: [],
    medium_value: [],
    low_value: []
  };

  customers.forEach(customer => {
    const segment = determineRFMSegment(customer, avgMonetary);
    segments[segment].push(customer);
  });

  return segments;
}
