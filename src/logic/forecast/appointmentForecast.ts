/**
 * 預約量推估引擎 (Appointment Estimation Engine)
 * 
 * 作為資深醫美診所營運顧問與資料分析師
 * 用途：營運展示與情境模擬（Scenario Estimation），非精準預測
 * 
 * 核心原則：
 * - 平滑、保守、可解釋
 * - 不過度擬合或複製歷史資料
 * - 避免劇烈跳動或不連續波動
 */

import type { AppointmentRecord } from "../../data/schema.js";

// Update EstimationData interface
export interface EstimationData {
  date: string;
  actual?: number;              // 實績量：status = completed | checked_in
  demand?: number;              // 需求量：所有 status (booked, cancelled, completed...)
  estimated?: number;           // 推估預約數
  estimatedTrend?: number;      // 推估趨勢（對已有資料）
  isEstimation: boolean;        // 是否為推估資料
  explanation?: string;         // 簡短解釋（1-2句）
  seasonalFactor: number;       // 季節係數
  dayOfWeek: number;            // 星期幾
}

/**
 * 計算最近30天的每日平均預約量（基準值）
 * mode: 'completed' (Actual) | 'total' (Demand)
 */
function calculateBaseline30Days(appointments: AppointmentRecord[], referenceDate: Date, mode: 'completed' | 'total' = 'completed'): number {
  const targetAppointments = appointments.filter(apt => {
    if (mode === 'completed') return apt.status === 'completed' || apt.status === 'checked_in';
    return true; // total demand
  });
  
  // 計算30天前的日期
  const thirtyDaysAgo = new Date(referenceDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // 篩選最近30天的資料
  const recentAppointments = targetAppointments.filter(apt => {
    const aptDate = new Date(apt.date);
    return aptDate >= thirtyDaysAgo && aptDate < referenceDate;
  });
  
  if (recentAppointments.length === 0) return 15; // 預設值
  
  // 統計每日預約量
  const dailyCounts: Record<string, number> = {};
  recentAppointments.forEach(apt => {
    if (!dailyCounts[apt.date]) dailyCounts[apt.date] = 0;
    dailyCounts[apt.date]++;
  });
  
  // 計算平均值
  const counts = Object.values(dailyCounts);
  const average = counts.reduce((sum, c) => sum + c, 0) / counts.length;
  
  console.log(`📊 最近30天基準值 (${mode}): ${average.toFixed(1)} 筆/天`);
  
  return average;
}

const AI_FACTORS = {
    dayWeights: [1.159, 0.973, 0.916, 0.952, 0.931, 0.98, 1.091], // 0(Sun) to 6(Sat)
    monthlyFactors: [0, 0.781, 0.977, 1.101, 1.194, 1.139, 0.641, 0.902, 0.925, 0.978, 0.802, 1.362, 1.322] // 1-12
};

function getSmoothDayOfWeekFactor(day: number): number {
  return AI_FACTORS.dayWeights[day] || 1.0;
}

function getSmoothSeasonalFactor(date: Date): number {
  const month = date.getMonth() + 1;
  return AI_FACTORS.monthlyFactors[month] || 1.0;
}

/**
 * 生成推估資料
 * @param appointments 預約記錄
 * @param startDate 開始日期
 * @param days 天數
 * @param seasonalFactor (deprecated in raw mode)
 * @param useRawBaseline If true, returns flat baseline for future without applying internal factors (for external WeightedModel)
 */
export function generateEstimation(
  appointments: AppointmentRecord[],
  startDate: Date,
  days: number,
  seasonalFactor: number = 0.2,
  useRawBaseline: boolean = false
): EstimationData[] {
  // Calculate Demand Baseline (Total) for Forecast Base
  const demandBaseline = calculateBaseline30Days(appointments, startDate, 'total');
  
  const estimation: EstimationData[] = [];
  
  // 處理歷史資料
  // 1. Demand (All)
  // 2. Actual (Completed/Checked-in)
  const historyDemand: Record<string, number> = {};
  const historyActual: Record<string, number> = {};

  appointments.forEach(apt => {
    // Demand: All
    if (!historyDemand[apt.date]) historyDemand[apt.date] = 0;
    historyDemand[apt.date]++;

    // Actual: Completed/Checked-in
    if (apt.status === 'completed' || apt.status === 'checked_in') {
      if (!historyActual[apt.date]) historyActual[apt.date] = 0;
      historyActual[apt.date]++;
    }
  });
  
  let previousEstimated = demandBaseline; // Start from Demand Base
  
  // Generate Data
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    
    // Get historical data if exists
    // Note: We might iterate partly over history and partly over future depending on 'startDate' and 'days'.
    // Assuming 'startDate' is 'today' or close to it.
    // Actually, usually we generate for a range relative to today.
    // If date < today, it's history.
    
    // Check if we have history for this date
    // (Simple check: is it in historyDemand?)
    const hasHistory = historyDemand[dateStr] !== undefined;

    if (hasHistory) {
        estimation.push({
            date: dateStr,
            actual: historyActual[dateStr] || 0,
            demand: historyDemand[dateStr] || 0,
            estimatedTrend: undefined, // History doesn't need trend usually, or maybe we want trend line over history? 
                                     // User said "Dataset 3 (Forecast): Orange dashed". Usually covers future.
            isEstimation: false,
            seasonalFactor: 1,
            dayOfWeek
        });
    } else {
        // Future Forecast
        let val = demandBaseline;
        
        if (!useRawBaseline) {
             const smoothSeasonalFactor = getSmoothSeasonalFactor(date);
             const dayFactor = getSmoothDayOfWeekFactor(dayOfWeek);
             val = demandBaseline * (1 + seasonalFactor) * smoothSeasonalFactor * dayFactor;
             // Here we imply demand forecast. If user wants Actual Forecast, they apply Rate externally.
        }

        estimation.push({
            date: dateStr,
            estimated: val,            // This is "Demand Base" if useRawBaseline is true
            estimatedTrend: val,       // Same
            isEstimation: true,
            seasonalFactor: 1,
            dayOfWeek
        });
    }
  }
  
  return estimation;
}

/**
 * 格式化日期顯示
 */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[date.getDay()];
  
  return `${month}/${day} (${weekday})`;
}
