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

export interface EstimationData {
  date: string;
  actual?: number;              // 實際預約數（所有狀態）
  estimated?: number;           // 推估預約數
  estimatedTrend?: number;      // 推估趨勢（對已有資料）
  isEstimation: boolean;        // 是否為推估資料
  explanation?: string;         // 簡短解釋（1-2句）
  seasonalFactor: number;       // 季節係數
  dayOfWeek: number;            // 星期幾
}

/**
 * 計算最近30天的每日平均預約量（基準值）
 * 只使用 completed 資料
 */
function calculateBaseline30Days(appointments: AppointmentRecord[], referenceDate: Date): number {
  const completedAppointments = appointments.filter(apt => apt.status === 'completed');
  
  // 計算30天前的日期
  const thirtyDaysAgo = new Date(referenceDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // 篩選最近30天的資料
  const recentAppointments = completedAppointments.filter(apt => {
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
  
  console.log(`📊 最近30天基準值: ${average.toFixed(1)} 筆/天 (共 ${counts.length} 天資料)`);
  
  return average;
}

/**
 * 計算平滑的季節性係數
 * 逐步變化，避免突然跳動
 */
function getSmoothSeasonalFactor(date: Date): number {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  
  // 年底旺季（11-12月）：+20% ~ +40%
  if (month === 12) {
    const progress = day / 31;
    return 1.2 + (0.2 * progress);
  }
  
  if (month === 11) {
    const progress = day / 30;
    return 1.1 + (0.1 * progress);
  }
  
  // 過年前4週（1月）：+10% ~ +20%
  if (month === 1) {
    const progress = Math.min(day / 29, 1);
    return 1.1 + (0.1 * progress);
  }
  
  // 年後回落（2-3月）：-10% ~ -20%
  if (month === 2) {
    const progress = day / 28;
    return 0.8 + (0.1 * progress);
  }
  
  if (month === 3) {
    const progress = day / 31;
    return 0.9 + (0.1 * progress);
  }
  
  // 春季回升（4-5月）
  if (month === 4 || month === 5) {
    return 1.0;
  }
  
  // 淡季（6月）：-20% ~ -30%
  if (month === 6) {
    return 0.75;
  }
  
  // 夏季（7-8月）
  if (month === 7 || month === 8) {
    return 0.85;
  }
  
  // 秋季（9月）
  if (month === 9) {
    return 0.95;
  }
  
  // 淡季（10月）：-20%
  if (month === 10) {
    return 0.8;
  }
  
  // 預設正常
  return 1.0;
}

/**
 * 計算星期幾的係數（平滑版本）
 */
function getSmoothDayOfWeekFactor(dayOfWeek: number): number {
  const factors: Record<number, number> = {
    0: 1.10,  // 週日：+10%
    1: 0.90,  // 週一：-10%
    2: 0.95,  // 週二：-5%
    3: 1.00,  // 週三：正常
    4: 1.05,  // 週四：+5%
    5: 1.10,  // 週五：+10%
    6: 1.15   // 週六：+15%
  };
  
  return factors[dayOfWeek] || 1.0;
}

/**
 * 平滑函數：避免劇烈跳動
 */
function smoothTransition(previousValue: number, targetValue: number, smoothness: number = 0.3): number {
  return previousValue * smoothness + targetValue * (1 - smoothness);
}

/**
 * 生成推估資料
 * @param appointments 預約記錄
 * @param startDate 開始日期
 * @param days 天數
 * @param seasonalFactor 旺季係數（僅套用於未來推估），預設 0.2 代表 +20%
 */
export function generateEstimation(
  appointments: AppointmentRecord[],
  startDate: Date,
  days: number,
  seasonalFactor: number = 0.2
): EstimationData[] {
  const baseline = calculateBaseline30Days(appointments, startDate);
  const estimation: EstimationData[] = [];
  
  // 處理歷史資料：顯示所有狀態 (排除 cancelled，只計算 completed 與 no_show 等有效預約)
  const historicalCounts: Record<string, number> = {};
  appointments.forEach(apt => {
    if (apt.status === 'cancelled') return;
    if (!historicalCounts[apt.date]) historicalCounts[apt.date] = 0;
    historicalCounts[apt.date]++;
  });
  
  // 用於平滑過渡
  let previousEstimated = baseline;
  
  // 用於移動平均（平滑未來推估）
  const estimationWindow: number[] = [];
  const windowSize = 3; // 3日移動平均
  
  // 生成推估
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    const dateStr = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    const smoothSeasonalFactor = getSmoothSeasonalFactor(date);
    const dayFactor = getSmoothDayOfWeekFactor(dayOfWeek);
    
    const actual = historicalCounts[dateStr];
    
    // 生成解釋文字
    let explanation = "";
    const month = date.getMonth() + 1;
    
    if (month === 12) {
      explanation = "年底旺季，皮膚保養需求增加";
    } else if (month === 1) {
      explanation = "農曆年前，預約需求穩定上升";
    } else if (month === 2) {
      explanation = "年後回落期，預約量逐步回升";
    } else if (month === 6) {
      explanation = "夏季淡季，預約量較為平穩";
    } else if (month === 11) {
      explanation = "進入旺季，預約需求開始增加";
    } else {
      explanation = "正常營運期間，預約量穩定";
    }
    
    // 週末補充說明
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      explanation += "（週末需求較高）";
    }
    
    if (actual !== undefined) {
      // 有實際資料：保持原樣，不套用旺季係數
      const trendEstimated = Math.round(baseline * smoothSeasonalFactor * dayFactor * 1.05);
      
      estimation.push({
        date: dateStr,
        actual: actual, // 歷史資料保持不變
        estimatedTrend: trendEstimated,
        isEstimation: false,
        explanation: "實際預約資料",
        seasonalFactor: smoothSeasonalFactor,
        dayOfWeek
      });
      
      // 更新基準（用於平滑過渡）
      previousEstimated = trendEstimated;
    } else {
      // 無實際資料：套用旺季係數
      // futureEstimate = baseline × (1 + seasonalFactor) × smoothSeasonalFactor × dayFactor
      let targetEstimated = baseline * (1 + seasonalFactor) * smoothSeasonalFactor * dayFactor;
      
      // 平滑過渡（避免劇烈跳動）
      const smoothedEstimated = smoothTransition(previousEstimated, targetEstimated, 0.2);
      
      // 加入移動平均窗口
      estimationWindow.push(smoothedEstimated);
      if (estimationWindow.length > windowSize) {
        estimationWindow.shift();
      }
      
      // 計算移動平均（平滑處理）
      const movingAverage = estimationWindow.reduce((sum, val) => sum + val, 0) / estimationWindow.length;
      
      // 四捨五入並確保至少1筆
      const finalEstimated = Math.max(1, Math.round(movingAverage));
      
      previousEstimated = finalEstimated;
      
      estimation.push({
        date: dateStr,
        estimated: finalEstimated,
        isEstimation: true,
        explanation,
        seasonalFactor: smoothSeasonalFactor,
        dayOfWeek
      });
    }
  }
  
  console.log(`🔮 推估生成完成: ${days}天, 基準=${baseline.toFixed(1)}, 旺季係數=+${(seasonalFactor * 100).toFixed(0)}%`);
  
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
