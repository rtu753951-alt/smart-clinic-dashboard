/**
 * Customer Base Selector
 * 顧客基礎分類選擇器
 * 
 * 資料來源：
 * - 所有顧客行為僅來自 appointments
 * - 只使用 status === 'completed' 的資料
 * - 不限制日期範圍（包含過去和未來的 completed 預約）
 * - 不使用任何 AI 推論、預測、加權
 * 
 * 顧客定義：
 * - 新客（New Customer）：在選定期間內第一次完成療程，且在期間開始之前沒有任何 completed 紀錄
 * - 回診客（Returning Customer）：在選定期間內有完成療程，且在期間開始之前至少有 1 次 completed 紀錄
 * - 回診率（Returning Visit Rate）：回診客人數 ÷ 期間內來診顧客總人數
 */

import type { Customer, CustomerSegment } from '../types/customer.js';

// ============================================
// Types
// ============================================

interface AppointmentRecord {
  id: string;
  customer_id: string;
  date: string; // ISO date
  status: 'completed' | 'cancelled' | 'no_show' | 'booked';
  customer_name?: string;
  service_item?: string;
  total_price?: number;
}

interface RootState {
  appointments: AppointmentRecord[];
}

interface DateRange {
  startDate: string; // ISO date
  endDate: string;   // ISO date
}

interface NewVsReturningResult {
  newCustomers: number;
  returningCustomers: number;
  totalCustomers: number;
}

interface CustomerOverview {
  newCustomers: number;
  returningCustomers: number;
  totalCustomers: number;
  returningVisitRate: number; // 百分比
  newCustomerIds: string[];
  returningCustomerIds: string[];
}

// ============================================
// Base Selectors
// ============================================

/**
 * 取得所有 appointments
 */
const selectAllAppointments = (state: RootState) => state.appointments;

/**
 * 取得日期範圍（從外部傳入）
 */
const selectDateRange = (_state: RootState, dateRange: DateRange) => dateRange;

// ============================================
// Computed Selectors
// ============================================

/**
 * 選擇器 1: 選定期間內已完成的預約
 * 
 * 規則：
 * - status === 'completed'
 * - date 在 [startDate, endDate] 範圍內
 * - 不限制未來或過去，只要是 completed 就算
 */
export function selectCompletedAppointmentsInRange(
  appointments: AppointmentRecord[],
  dateRange: DateRange
): AppointmentRecord[] {
  const { startDate, endDate } = dateRange;

  return appointments.filter(apt => {
    // 只要 completed
    if (apt.status !== 'completed') return false;

    // 在日期範圍內
    if (apt.date < startDate || apt.date > endDate) return false;

    return true;
  });
}

/**
 * 選擇器 2: 顧客首次來訪日期 Map
 * 
 * 計算每位顧客的第一次 completed 預約日期（全時間範圍）
 * 用於判斷新客 vs 回診客
 * 
 * 規則：
 * - 只考慮 status === 'completed' 的預約
 * - 不限制日期範圍（包含過去和未來）
 */
export function selectCustomerFirstVisitMap(
  appointments: AppointmentRecord[]
): Map<string, string> {
  const firstVisitMap = new Map<string, string>();

  // 只考慮 completed 預約
  const completedAppointments = appointments.filter(
    apt => apt.status === 'completed'
  );

  // 按日期排序
  const sorted = [...completedAppointments].sort((a, b) => a.date.localeCompare(b.date));

  // 記錄每位顧客的首次來訪日期
  sorted.forEach(apt => {
    if (!firstVisitMap.has(apt.customer_id)) {
      firstVisitMap.set(apt.customer_id, apt.date);
    }
  });

  return firstVisitMap;
}

/**
 * 選擇器 3: 選定期間內的顧客列表（去重）
 * 
 * 回傳在期間內有 completed 預約的所有 customer_id
 */
export function selectCustomersInRange(
  appointments: AppointmentRecord[]
): string[] {
  const customerIds = new Set<string>();
  appointments.forEach(apt => {
    customerIds.add(apt.customer_id);
  });
  return Array.from(customerIds);
}

/**
 * 選擇器 4: 新客 vs 回診客分類
 * 
 * 規則：
 * - 新客：在期間內有 completed，且首次來訪日期在期間內
 * - 回診客：在期間內有 completed，且首次來訪日期在期間開始之前
 */
export function selectNewVsReturningCustomers(
  customerIds: string[],
  firstVisitMap: Map<string, string>,
  dateRange: DateRange
): NewVsReturningResult {
  const { startDate } = dateRange;

  let newCustomers = 0;
  let returningCustomers = 0;

  customerIds.forEach(customerId => {
    const firstVisitDate = firstVisitMap.get(customerId);

    if (!firstVisitDate) {
      // 理論上不應該發生，但為了安全起見
      return;
    }

    if (firstVisitDate >= startDate) {
      // 首次來訪在期間內 → 新客
      newCustomers++;
    } else {
      // 首次來訪在期間之前 → 回診客
      returningCustomers++;
    }
  });

  return {
    newCustomers,
    returningCustomers,
    totalCustomers: customerIds.length
  };
}

/**
 * 選擇器 5: 回診率
 * 
 * 定義：回診客人數 ÷ 期間內來診顧客總人數
 * 回傳百分比（0-100）
 */
export function selectReturningVisitRate(
  result: NewVsReturningResult
): number {
  if (result.totalCustomers === 0) return 0;
  return Math.round((result.returningCustomers / result.totalCustomers) * 100);
}

/**
 * 選擇器 6: 顧客概覽（給 UI 使用）
 * 
 * 彙總所有顧客基礎資料，包含：
 * - 新客/回診客人數
 * - 總顧客數
 * - 回診率
 * - 新客/回診客 ID 列表（供後續分析使用）
 */
export function selectCustomerOverview(
  appointments: AppointmentRecord[],
  dateRange: DateRange
): CustomerOverview {
  // 組合所有 selectors
  const completedAppts = selectCompletedAppointmentsInRange(appointments, dateRange);
  const customerIds = selectCustomersInRange(completedAppts);
  const firstVisitMap = selectCustomerFirstVisitMap(appointments);
  const nvr = selectNewVsReturningCustomers(customerIds, firstVisitMap, dateRange);
  const rate = selectReturningVisitRate(nvr);

  const { startDate } = dateRange;

  // 分類顧客 ID
  const newCustomerIds: string[] = [];
  const returningCustomerIds: string[] = [];

  customerIds.forEach(customerId => {
    const firstVisitDate = firstVisitMap.get(customerId);
    if (!firstVisitDate) return;

    if (firstVisitDate >= startDate) {
      newCustomerIds.push(customerId);
    } else {
      returningCustomerIds.push(customerId);
    }
  });

  return {
    newCustomers: nvr.newCustomers,
    returningCustomers: nvr.returningCustomers,
    totalCustomers: nvr.totalCustomers,
    returningVisitRate: rate,
    newCustomerIds,
    returningCustomerIds
  };
}

// ============================================
// Legacy Functions (保留向後相容)
// ============================================

/**
 * 分類新客與回診客（舊版函數，保留向後相容）
 * 
 * @deprecated 請使用 selectNewVsReturningCustomers selector
 */
export function selectCustomersBySegment(customers: Customer[]): Record<CustomerSegment, Customer[]> {
  const newCustomers: Customer[] = [];
  const returningCustomers: Customer[] = [];

  customers.forEach(customer => {
    if (customer.totalVisits === 1) {
      newCustomers.push(customer);
    } else if (customer.totalVisits > 1) {
      returningCustomers.push(customer);
    }
  });

  return {
    new: newCustomers,
    returning: returningCustomers
  };
}

/**
 * 取得新客列表（舊版函數，保留向後相容）
 * 
 * @deprecated 請使用 selectCustomerOverview.newCustomerIds
 */
export function selectNewCustomers(customers: Customer[]): Customer[] {
  return customers.filter(c => c.totalVisits === 1);
}

/**
 * 取得回診客列表（舊版函數，保留向後相容）
 * 
 * @deprecated 請使用 selectCustomerOverview.returningCustomerIds
 */
export function selectReturningCustomers(customers: Customer[]): Customer[] {
  return customers.filter(c => c.totalVisits > 1);
}
