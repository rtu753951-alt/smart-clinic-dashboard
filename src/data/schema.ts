// src/data/schema.ts
// 統一管理所有 CSV 對應的 TypeScript 型別
// 之後 DataStore / KPI Engine / AI 建議都會用這一份

// -------- 共用型別 --------
export type Gender = "male" | "female";

export type YesNo = "yes" | "no";

/**
 * 預約狀態：
 * - completed：已完成療程
 * - no_show：有預約但未到
 * - cancelled：事前取消
 * 其餘狀態（例如 pending 等）暫時用 string 容納
 */
export type AppointmentStatus = "completed" | "no_show" | "cancelled" | string;

/**
 * 員工類型：對應 staff.csv 的 staff_type
 * 
 * 標準化規則：
 * - 系統內部只使用四種標準名稱
 * - therapist 代表「美療師」（UI 顯示層可轉換為中文）
 * - 不允許 beauty_therapist 出現在資料邏輯中
 */
export type StaffType = "doctor" | "nurse" | "therapist" | "consultant" | "admin";

/**
 * StaffRole 別名（與 StaffType 相同）
 * 用於 executor_role 等場景
 */
export type StaffRole = StaffType;

/**
 * 療程分類：對應 services.csv 的 category
 */
export type ServiceCategory = "laser" | "inject" | "rf" | "consult" | "drip" | string;

/**
 * 房間類型：對應 rooms.csv 的 room_type
 */
export type RoomType = "consult" | "laser" | "rf" | string;

/**
 * 設備類型：對應 equipment.csv 的 equipment_type
 */
export type EquipmentType = "laser" | "rf" | string;

/**
 * 員工工作紀錄類型：對應 staff_workload.csv 的 action_type
 */
export type StaffActionType = "consultation" | "assist" | "laser_op" | "operation" | string;

// ------------------------------------
// ① appointments.csv 對應型別
// ------------------------------------

/**
 * appointments.csv 原始欄位：
 * appointment_id,date,time,age,gender,is_new,purchased_services,doctor_name,staff_role,service_item,status,room,equipment
 *
 * ✅ 清洗規則（之後會在 DataStore 實作）：
 * - date         ：保留 "YYYY-MM-DD" 字串，另可衍生 Date 物件
 * - time         ：保留 "HH:mm:ss" 或 "HH:mm" 字串
 * - is_new       ："yes"/"no" → boolean isNew
 * - purchased_services：以 ";" 切成 string[]（去除空白）
 * - status       ："cancelled" 會在多數 KPI 中排除
 * - no_show      ：算預約，但到診 = 0
 */
export interface AppointmentRecord {
  consultant_name?: string;   // ⭐⭐⭐ 推薦做法
  staff_name?: string; // 改為 optional
  customer: any;
  service: any;
  doctor: any;
  appointment_id: string;
  date: string;
  time: string;
  age: number;
  gender: "male" | "female";
  is_new: "yes" | "no";
  purchased_services: string;
  doctor_name: string;
  assistant_name: string;
  assistant_role?: string;
  service_item: string;
  status: AppointmentStatus;
  room: string;
  equipment: string;
  customer_id: string;   // 🔥 新增這一行
  amount?: number;
  duration?: number;
}


// ------------------------------------
// ② services.csv 對應型別
// ------------------------------------

/**
 * services.csv：
 * service_name,category,price,duration,buffer_time
 */
export interface ServiceInfo {
  service_name: string;
  category: ServiceCategory; // laser / inject / rf / consult / drip ...
  price: number;             // 單次原價
  duration: number;          // 操作時間（分鐘）
  buffer_time: number;       // 緩衝時間（分鐘）
  executor_role: StaffRole;  // 標準角色：doctor | nurse | therapist | consultant
  intensity?: string;        // high / medium / low (from csv intensity_level)
}

// ------------------------------------
// ③ rooms.csv 對應型別
// ------------------------------------

/**
 * rooms.csv：
 * room_name,room_type,status
 */
export interface RoomRecord {
  room_name: string;   // 診間A、診間B、雷射室、RF治療室...
  room_type: RoomType; // consult / laser / rf
  status: string;      // e.g. "available" 之後可以擴充
}

// ------------------------------------
// ④ equipment.csv 對應型別
// ------------------------------------

/**
 * equipment.csv：
 * equipment_name,equipment_type,room_name,status
 */
export interface EquipmentRecord {
  equipment_name: string;  // PicoSure皮秒雷射 ...
  equipment_type: EquipmentType; // laser / rf ...
  room_name: string;       // 對應 RoomRecord.room_name
  status: string;          // e.g. "active"
}

// ------------------------------------
// ⑤ staff.csv 對應型別
// ------------------------------------

/**
 * staff.csv：
 * staff_name,staff_type,specialty,skill_level,certified_services,status
 */
export interface StaffRecord {
  staff_name: string;      // 王醫師、張護理師...
  staff_type: StaffType;   // doctor / nurse / therapist / consultant
  specialty: string;       // e.g. "皮膚科", "皮秒", "諮詢分析"
  skill_level?: string;    // junior / mid / senior
  certified_services?: string; // e.g. "Botox|Thread Lift|Thermage"
  status: string;          // e.g. "active"
}

// ------------------------------------
// ⑥ staff_workload.csv 對應型別
// ------------------------------------

/**
 * staff_workload.csv：
 * date,staff_name,action_type,count
 *
 * - date       ："YYYY-MM-DD"
 * - count      ：當天某類工作的次數
 */
export interface StaffWorkloadRecord {
  date: string;
  staff_name: string;      // 對應 StaffRecord.staff_name
  action_type: StaffActionType;
  count: number;           // Mapped from 'cases' or 'count'
  minutes?: number;        // Mapped from 'minutes' (New)
}

// ------------------------------------
// ⑦ package_usage.csv 對應型別（★ 已升級為有 customer_id）
// ------------------------------------

/**
 * package_usage.csv（建議新版）：
 *
 * ✅ 建議你用 Kiro 生成成這種結構：
 *
 * customer_id,customer_name,service_name,total_sessions,used_sessions,remaining_sessions,last_used_date
 *
 * 例如：
 * CUS001,王女士,Pico Laser,8,5,3,2025-11-05
 *
 * 如果暫時不想改 CSV，也可以在 DataStore 裡用 customer_name 自動生成 customer_id。
 */
export interface PackageUsageRecord {
  customer_id: string;     // e.g. "CUS001"
  customer_name: string;   // e.g. "王女士"
  service_name: string;    // 對應 ServiceRecord.service_name
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  last_used_date: string;  // "YYYY-MM-DD"
}

export interface CustomerProfile {
  customer_id: string; // CUSTxxx
  gender: string;
  age: number;
  birth_year: number;
  age_group: string;
  first_visit_date: string;
  last_visit_date: string;
  visit_count: number;
}
// Alias for backward compatibility
export type CustomerRecord = CustomerProfile;

export interface CustomerVisit {
  customer_id: string; // C00xxx
  name: string;
  gender: string;
  age: number;
  visit_date: string;
  visit_time: string;
  treatment_type: string;
  doctor: string;
  nurse: string;
  room_id: string;
  is_new: boolean;
  source: string;
  status: string;
  revenue: number;
}




// ------------------------------------
// ⑧ Import Jobs (Data Governance)
// ------------------------------------

export type ImportStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type DatasetType = "APPOINTMENTS" | "STAFF" | "SERVICES" | "ROOMS" | "EQUIPMENT" | "TASKS";
export type ImportSource = "UPLOAD_CSV" | "GOOGLE_SHEETS" | "MANUAL" | "SYSTEM";
export type ImportMode = "APPEND" | "REPLACE" | "UPSERT";

export interface ImportRecord {
  id: string;
  filename: string;
  file_hash: string;
  imported_at: string; // ISO String
  status: ImportStatus;
  
  dataset: DatasetType;
  source: ImportSource;
  mode: ImportMode;
  
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  
  valid_count: number;
  quarantine_count: number;
  warning_count: number;
  
  report_json: Record<string, any>; // Strictly typed as object
  error_summary?: string;
}
