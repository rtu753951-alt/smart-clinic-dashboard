/**
 * 醫療安全與排程風險分析器
 * 
 * 角色：醫美診所「醫療安全與排程風險」分析師
 * 原則：保守、避免評價個人績效、精簡可行動
 */

// ===== 型別定義 =====

export interface RoleUtilization {
  role: string;
  usedHours: number;
  totalHours: number;
  pct_display: number;
  pct_raw?: number;
  overloadHours?: number;
}

export interface RoleDayAggregate {
  date: string;
  role: string;
  total_visits: number;
  combo_visits: number;
  combo_ratio: number;
  high_focus_minutes: number;
  total_minutes: number;
  cancelled: number;
  no_show: number;
}

export interface TopSlot {
  date: string;
  time_bucket: string;
  role: string;
  total_minutes: number;
  high_focus_minutes: number;
  combo_ratio: number;
}

export interface WeeklyAggregates {
  by_role_day: RoleDayAggregate[];
  top_slots: TopSlot[];
}

export interface RiskAlert {
  level: 'red' | 'yellow';
  type: 'capacity' | 'high_focus_streak' | 'combo_congestion' | 'volatility';
  when: string;
  who: string;
  evidence: string;
  why_it_matters: string;
}

export interface ActionItem {
  action: string;
  target: string;
  purpose: string;
}

export interface ReviewItem {
  date: string;
  time_bucket: string;
  role: string;
  risk_type: string;
  reason: string;
}

export interface RiskAnalysisReport {
  summary: {
    window_label: string;
    capacity_notes: string[];
    risk_notes: string[];
  };
  alerts: RiskAlert[];
  actions: ActionItem[];
  review_list: ReviewItem[];
}

// ===== 角色中文名稱 =====
const ROLE_NAMES: Record<string, string> = {
  doctor: '醫師',
  consultant: '諮詢師',
  nurse: '護理師',
  therapist: '美療師'
};

// ===== 主要分析函數 =====

export function analyzeStaffRisks(
  roleUtilization: RoleUtilization[],
  weeklyAggregates: WeeklyAggregates,
  windowLabel: '本週' | '下週' | '未來30天'
): RiskAnalysisReport {
  
  const alerts: RiskAlert[] = [];
  const reviewList: ReviewItem[] = [];
  
  // ===== 1. 容量判定（優先且必須） =====
  const capacityAlerts = analyzeCapacity(roleUtilization);
  alerts.push(...capacityAlerts);
  
  // ===== 2. 複合療程擁擠判定 =====
  const comboAlerts = analyzeComboRisk(weeklyAggregates.by_role_day);
  alerts.push(...comboAlerts.slice(0, 4)); // 最多 2 red + 2 yellow
  
  // ===== 3. 連續高強度判定 =====
  const focusAlerts = analyzeHighFocusRisk(weeklyAggregates.by_role_day);
  alerts.push(...focusAlerts);
  
  // ===== 4. 波動風險判定 =====
  const volatilityAlerts = analyzeVolatility(weeklyAggregates.by_role_day);
  alerts.push(...volatilityAlerts);
  
  // ===== 去重與排序 =====
  const dedupedAlerts = deduplicateAlerts(alerts);
  const sortedAlerts = dedupedAlerts
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'red' ? -1 : 1;
      return 0;
    })
    .slice(0, 5); // 最多 5 筆
  
  // ===== 生成摘要 =====
  const summary = generateSummary(roleUtilization, sortedAlerts, windowLabel);
  
  // ===== 生成行動建議 =====
  const actions = generateActions(sortedAlerts);
  
  // ===== 生成人工確認清單 =====
  const reviewItems = generateReviewList(sortedAlerts, weeklyAggregates);
  
  return {
    summary,
    alerts: sortedAlerts,
    actions,
    review_list: reviewItems.slice(0, 8)
  };
}

// ===== 容量分析 =====
function analyzeCapacity(utilization: RoleUtilization[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  
  utilization.forEach(u => {
    const pct = u.pct_raw ?? u.pct_display;
    const overload = u.overloadHours ?? 0;
    
    if (pct >= 100 || overload > 0) {
      alerts.push({
        level: 'red',
        type: 'capacity',
        when: '整體視窗',
        who: u.role,
        evidence: overload > 0 
          ? `負載率 ${pct}%，超載 +${overload.toFixed(1)}h`
          : `負載率 ${pct}%，已達滿載`,
        why_it_matters: '可能影響服務品質與員工健康，建議評估是否需要增加人力或分散排程'
      });
    } else if (pct >= 90) {
      alerts.push({
        level: 'yellow',
        type: 'capacity',
        when: '整體視窗',
        who: u.role,
        evidence: `負載率 ${pct}%，接近滿載`,
        why_it_matters: '建議預留緩衝空間以應對突發狀況'
      });
    }
  });
  
  return alerts;
}

// ===== 複合療程擁擠分析 =====
function analyzeComboRisk(byRoleDay: RoleDayAggregate[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  
  // 按 combo_ratio 排序，只挑最嚴重的幾天
  const sorted = [...byRoleDay]
    .filter(d => d.combo_ratio >= 35)
    .sort((a, b) => b.combo_ratio - a.combo_ratio);
  
  let redCount = 0;
  let yellowCount = 0;
  
  for (const day of sorted) {
    if (day.combo_ratio >= 45 && redCount < 2) {
      alerts.push({
        level: 'red',
        type: 'combo_congestion',
        when: formatDate(day.date),
        who: day.role,
        evidence: `複合療程佔比 ${day.combo_ratio.toFixed(0)}% (${day.combo_visits}/${day.total_visits} 筆)`,
        why_it_matters: '複雜度集中可能影響專注度與服務品質，建議分散排程'
      });
      redCount++;
    } else if (day.combo_ratio >= 35 && day.combo_ratio < 45 && yellowCount < 2) {
      alerts.push({
        level: 'yellow',
        type: 'combo_congestion',
        when: formatDate(day.date),
        who: day.role,
        evidence: `複合療程佔比 ${day.combo_ratio.toFixed(0)}% (${day.combo_visits}/${day.total_visits} 筆)`,
        why_it_matters: '建議適度分散複合療程以維持服務品質'
      });
      yellowCount++;
    }
    
    if (redCount >= 2 && yellowCount >= 2) break;
  }
  
  return alerts;
}

// ===== 連續高強度分析 =====
function analyzeHighFocusRisk(byRoleDay: RoleDayAggregate[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  
  byRoleDay.forEach(day => {
    if (day.high_focus_minutes >= 180) {
      alerts.push({
        level: 'red',
        type: 'high_focus_streak',
        when: formatDate(day.date),
        who: day.role,
        evidence: `連續高強度 ${day.high_focus_minutes} 分鐘`,
        why_it_matters: '長時間高強度工作易致疲勞，建議插入 10-20 分鐘休息緩衝'
      });
    } else if (day.high_focus_minutes >= 120) {
      alerts.push({
        level: 'yellow',
        type: 'high_focus_streak',
        when: formatDate(day.date),
        who: day.role,
        evidence: `連續高強度 ${day.high_focus_minutes} 分鐘`,
        why_it_matters: '建議適度插入休息時間以維持專注力'
      });
    }
  });
  
  return alerts;
}

// ===== 波動風險分析 =====
function analyzeVolatility(byRoleDay: RoleDayAggregate[]): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  
  byRoleDay.forEach(day => {
    const totalCancelled = day.cancelled + day.no_show;
    const volatilityRate = day.total_visits > 0 
      ? (totalCancelled / day.total_visits) * 100 
      : 0;
    
    if (volatilityRate >= 30) {
      alerts.push({
        level: 'red',
        type: 'volatility',
        when: formatDate(day.date),
        who: day.role,
        evidence: `取消+爽約率 ${volatilityRate.toFixed(0)}% (${totalCancelled}/${day.total_visits} 筆)`,
        why_it_matters: '高波動影響排程穩定性，建議採取預約前一日二次確認或候補機制'
      });
    } else if (volatilityRate >= 20) {
      alerts.push({
        level: 'yellow',
        type: 'volatility',
        when: formatDate(day.date),
        who: day.role,
        evidence: `取消+爽約率 ${volatilityRate.toFixed(0)}% (${totalCancelled}/${day.total_visits} 筆)`,
        why_it_matters: '建議加強預約確認以提升排程穩定性'
      });
    }
  });
  
  return alerts;
}

// ===== 去重 =====
function deduplicateAlerts(alerts: RiskAlert[]): RiskAlert[] {
  const map = new Map<string, RiskAlert>();
  
  alerts.forEach(alert => {
    const key = `${alert.when}_${alert.who}_${alert.type}`;
    const existing = map.get(key);
    
    if (!existing || alert.level === 'red') {
      map.set(key, alert);
    }
  });
  
  return Array.from(map.values());
}

// ===== 生成摘要 =====
function generateSummary(
  utilization: RoleUtilization[],
  alerts: RiskAlert[],
  windowLabel: string
): { window_label: string; capacity_notes: string[]; risk_notes: string[] } {
  
  const capacityNotes: string[] = [];
  const riskNotes: string[] = [];
  
  // 容量摘要
  const overloaded = utilization.filter(u => (u.pct_raw ?? u.pct_display) >= 100 || (u.overloadHours ?? 0) > 0);
  if (overloaded.length > 0) {
    const roles = overloaded.map(u => ROLE_NAMES[u.role] || u.role).join('、');
    capacityNotes.push(`${roles}負載已達或超過滿載，需評估人力配置`);
  }
  
  const nearFull = utilization.filter(u => {
    const pct = u.pct_raw ?? u.pct_display;
    return pct >= 90 && pct < 100;
  });
  if (nearFull.length > 0 && capacityNotes.length < 2) {
    const roles = nearFull.map(u => ROLE_NAMES[u.role] || u.role).join('、');
    capacityNotes.push(`${roles}負載接近滿載，建議預留緩衝空間`);
  }
  
  // 風險摘要
  const comboRisks = alerts.filter(a => a.type === 'combo_congestion');
  const focusRisks = alerts.filter(a => a.type === 'high_focus_streak');
  const volatilityRisks = alerts.filter(a => a.type === 'volatility');
  
  if (comboRisks.length > 0 || focusRisks.length > 0) {
    const parts: string[] = [];
    if (comboRisks.length > 0) parts.push('複合療程集中');
    if (focusRisks.length > 0) parts.push('連續高強度排程');
    riskNotes.push(`發現${parts.join('與')}情況，建議適度分散以維持品質`);
  }
  
  if (volatilityRisks.length > 0 && riskNotes.length < 2) {
    riskNotes.push('部分時段取消率偏高，建議加強預約確認機制');
  }
  
  return {
    window_label: windowLabel,
    capacity_notes: capacityNotes.slice(0, 2),
    risk_notes: riskNotes.slice(0, 2)
  };
}

// ===== 生成行動建議 =====
function generateActions(alerts: RiskAlert[]): ActionItem[] {
  const actions: ActionItem[] = [];
  const actionSet = new Set<string>();
  
  // 根據 alert 類型生成建議
  alerts.forEach(alert => {
    let action: ActionItem | null = null;
    
    switch (alert.type) {
      case 'capacity':
        if (!actionSet.has('capacity')) {
          action = {
            action: '評估是否需要增加人力或將部分可轉移療程分散至其他時段',
            target: alert.who,
            purpose: '避免過載影響服務品質與員工健康'
          };
          actionSet.add('capacity');
        }
        break;
        
      case 'high_focus_streak':
        if (!actionSet.has('focus_buffer')) {
          action = {
            action: '在連續高強度療程之間插入 10-20 分鐘休息緩衝',
            target: alert.who,
            purpose: '維持專注力與服務品質'
          };
          actionSet.add('focus_buffer');
        }
        break;
        
      case 'combo_congestion':
        if (!actionSet.has('combo_spread')) {
          action = {
            action: '將部分複合療程分散至其他日期或時段',
            target: alert.who,
            purpose: '降低單日複雜度、提升專注力'
          };
          actionSet.add('combo_spread');
        }
        break;
        
      case 'volatility':
        if (!actionSet.has('volatility_confirm')) {
          action = {
            action: '對高波動時段採取預約前一日二次確認或建立候補名單',
            target: alert.who,
            purpose: '提升排程穩定性與資源利用'
          };
          actionSet.add('volatility_confirm');
        }
        break;
    }
    
    if (action && actions.length < 5) {
      actions.push(action);
    }
  });
  
  // 如果沒有特定建議，給一個通用建議
  if (actions.length === 0) {
    actions.push({
      action: '維持現有排程模式，持續觀察負載變化',
      target: '全體',
      purpose: '確保服務品質穩定'
    });
  }
  
  return actions.slice(0, 5);
}

// ===== 生成人工確認清單 =====
function generateReviewList(
  alerts: RiskAlert[],
  aggregates: WeeklyAggregates
): ReviewItem[] {
  const items: ReviewItem[] = [];
  
  alerts.forEach(alert => {
    if (alert.when !== '整體視窗') {
      items.push({
        date: alert.when.split(' ')[0], // 取日期部分
        time_bucket: '全日',
        role: alert.who,
        risk_type: alert.type,
        reason: alert.evidence
      });
    }
  });
  
  return items;
}

// ===== 輔助函數 =====
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdays[date.getDay()];
  return `${dateStr} (${weekday})`;
}
