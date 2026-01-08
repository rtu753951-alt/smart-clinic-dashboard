// Migrated from src/data/schema.ts
// 統一管理所有 CSV 對應的 TypeScript 型別

export type Gender = "male" | "female";
export type YesNo = "yes" | "no";

export type AppointmentStatus = "completed" | "no_show" | "cancelled" | string;
export type StaffType = "doctor" | "nurse" | "therapist" | "consultant";
export type StaffRole = StaffType;
export type ServiceCategory = "laser" | "inject" | "rf" | "consult" | "drip" | string;
export type RoomType = "consult" | "laser" | "rf" | string;
export type EquipmentType = "laser" | "rf" | string;
export type StaffActionType = "consultation" | "assist" | "laser_op" | "operation" | string;

export interface AppointmentRecord {
  appointment_id: string;
  date: string;
  time: string;
  customer_id?: string;
  age?: number;
  gender?: "male" | "female";
  is_new?: "yes" | "no";
  service_item?: string;
  purchased_services?: string;
  doctor_name?: string;
  staff_role?: StaffType | "";
  status: AppointmentStatus;
  room?: string;
  equipment?: string;
  
  // Extra fields for logic
  match_role?: string; 
}

export interface ServiceInfo {
  service_name: string;
  category: ServiceCategory;
  price: number;
  duration: number;
  buffer_time: number;
  executor_role: StaffRole;
  intensity?: string;
  transferable?: string | boolean;
}

export interface RoomRecord {
  room_name: string;
  room_type: RoomType;
  status: string;
}

export interface EquipmentRecord {
  equipment_name: string;
  equipment_type: EquipmentType;
  room_name: string;
  status: string;
}

export interface StaffRecord {
  staff_name: string;
  staff_type: StaffType;
  specialty: string;
  skill_level?: string;
  certified_services?: string;
  status: string;
}


export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  dataset: 'appointments' | 'staff' | 'services';
  rowIndex: number;
  id: string; 
  field: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
  suggestedFix?: string;
  path?: (string | number)[];
}

export interface ValidationReport {
  snapshotId: string;
  timestamp: string;
  issues: ValidationIssue[];
  validAppointments: AppointmentRecord[];
  quarantinedAppointments: QuarantinedRecord[];
  meta: {
    totalProcessed: number;
    errorCount: number;
    warningCount: number;
    validCount: number;
    quarantineCount: number;
  }
}

export interface QuarantinedRecord {
  record: AppointmentRecord;
  rowIndex: number;
  reasons: string[];
}
