/**
 * Customer Insights Feature
 * 顧客洞察功能模組
 * 
 * 對外 export hook 與 types
 */

// Types
export type { Customer, CustomerSegment } from './types/customer.js';
export type { RFMScore, RFMSegment } from './types/rfm.js';
export type { ChurnRiskLevel, ChurnRiskResult } from './types/churn.js';

// Selectors
export {
  selectCustomersBySegment,
  selectNewCustomers,
  selectReturningCustomers
} from './selectors/customerBaseSelector.js';

export {
  calculateRFMScore,
  determineRFMSegment,
  selectCustomersByRFM
} from './selectors/rfmSelector.js';

export {
  calculateChurnRisk,
  selectChurnRisks,
  selectHighRiskCustomers,
  selectChurnRisksByLevel
} from './selectors/churnRiskSelector.js';

// Hooks
export { useCustomerInsights } from './hooks/useCustomerInsights.js';
export type { CustomerInsightsData } from './hooks/useCustomerInsights.js';
