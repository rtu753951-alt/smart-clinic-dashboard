/**
 * 療程工時佔比定義表 (Treatment Work-Time Ratios)
 * 
 * 用於計算：
 * 1. DemandEstimator: 預估排班需求
 * 2. StaffWorkloadChart: 計算實際工時負荷
 * 3. HumanRiskEngine: 風險評估模型
 * 
 * 數值意義：
 * - 1.0 = 該職位需全程參與 (e.g. 60分鐘療程 = 60分鐘工時)
 * - 0.35 = 該職位需間歇性參與 (e.g. 60分鐘療程 = 21分鐘工時)
 */
export const INVOLVEMENT_RATIOS: Record<string, Record<string, number>> = {
  // 微整注射: 醫師操作35%時間, 護理師協助 (0.6)
  inject: { doctor: 0.35, therapist: 0.2, nurse: 0.6, consultant: 0.1 },
  
  // 電音波: 醫師操作35%時間, 美療師協助 (0.8)
  rf: { doctor: 0.35, therapist: 0.8, nurse: 0.4, consultant: 0.1 },
  
  // 雷射: 美療師全程跟診(1.0), 醫師操作15%, 護理師也可協助(0.8)
  laser: { doctor: 0.15, therapist: 1.0, nurse: 0.8, consultant: 0 },
  
  // 點滴: 護理師全程(1.0), 醫師僅開單(0.1)
  drip: { doctor: 0.10, therapist: 0.1, nurse: 1.0, consultant: 0 },
  
  // 諮詢: 諮詢師主導(0.7), 醫師輔助(0.3)
  consult: { doctor: 0.30, therapist: 0, nurse: 0.1, consultant: 0.70 },
  
  // 其他預設
  other: { doctor: 0, therapist: 1.0, nurse: 0.8, consultant: 0, admin: 1.0 },

  // 行政 (如果是獨立類別)
  admin_work: { doctor: 0, therapist: 0, nurse: 0, consultant: 0, admin: 1.0 }
};
