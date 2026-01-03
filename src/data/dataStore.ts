// src/data/dataStore.ts
import { loadCSV } from "./csvLoader.js";
import { normalizeRole } from "./roleUtils.js";
import type {
  AppointmentRecord,
  ServiceInfo,
  RoomRecord,
  EquipmentRecord,
  StaffRecord,
  StaffWorkloadRecord,
  PackageUsageRecord,
  CustomerRecord,
  StaffType,
  StaffRole,
  AppointmentStatus,
  ServiceCategory,
  RoomType,
  EquipmentType,
  StaffActionType,
} from "./schema.js";

class DataStore {
  // 7 大資料表
  appointments: AppointmentRecord[] = [];
  services: ServiceInfo[] = [];
  rooms: RoomRecord[] = [];
  equipment: EquipmentRecord[] = [];
  staff: StaffRecord[] = [];
  staffWorkload: StaffWorkloadRecord[] = [];
  packageUsage: PackageUsageRecord[] = [];
  customers: CustomerRecord[] = [];

  async loadAll() {
    console.log("DataStore: 開始讀取所有 CSV...");

    // 一次平行載入所有 CSV（仍然是簡單的 fetch + text ）
    const [
      rawAppointments,
      rawServices,
      rawRooms,
      rawEquipment,
      rawStaff,
      rawStaffWorkload,
      rawPackageUsage,
      rawCustomers,
    ] = await Promise.all([
      loadCSV<any>("data/appointments.csv"),
      loadCSV<any>("data/services.csv"),
      loadCSV<any>("data/rooms.csv"),
      loadCSV<any>("data/equipment.csv"),
      loadCSV<any>("data/staff.csv"),
      loadCSV<any>("data/staff_workload.csv"),
      loadCSV<any>("data/package_usage.csv"),
      loadCSV<any>("data/customers.csv"),
    ]);


    
    if (!rawStaffWorkload || rawStaffWorkload.length === 0) {
      console.warn("⚠️ [DataStore] rawStaffWorkload is empty.");
    }

    // -------------------- appointments.csv 清洗 --------------------
    this.appointments = (rawAppointments || []).map((raw: any): AppointmentRecord => {
      const gender = raw.gender === "male" || raw.gender === "female" ? raw.gender : "female";

      const staffRoleRaw = (raw.staff_role ?? "").trim();
      const staffRole = staffRoleRaw === "" ? "" : (staffRoleRaw as StaffType);

      const statusRaw = (raw.status ?? "completed").trim().toLowerCase();
      const status: AppointmentStatus =
        statusRaw === "completed" || statusRaw === "no_show" || statusRaw === "cancelled"
          ? statusRaw
          : (statusRaw as AppointmentStatus);

      return {
  appointment_id: String(raw.appointment_id ?? "").trim(),
  date: String(raw.date ?? "").trim(), // "2025-10-27"
  time: String(raw.time ?? "").trim(), // "12:00:00"
  age: Number(raw.age) || 0,
  gender,
  is_new: raw.is_new === "yes" ? "yes" : "no",
  purchased_services: String(raw.purchased_services ?? "").trim(),
  doctor_name: String(raw.doctor_name ?? "").trim(),
  staff_role: staffRole,
  service_item: String(raw.service_item ?? "").trim(),
  status,
  room: String(raw.room ?? "").trim(),
  equipment: String(raw.equipment ?? "").trim(),
  customer_id: String(raw.customer_id ?? "").trim(),
  customer: undefined,
  service: undefined,
  doctor: undefined,

};
    });



    // -------------------- services.csv 清洗 --------------------
    this.services = (rawServices || []).map((raw: any): ServiceInfo => {
      const category = (raw.category ?? "").trim() as ServiceCategory;
      const rawRole = String(raw.executor_role ?? "").trim();
      
      // 🔧 角色標準化：beauty_therapist → therapist
      const executor_role = normalizeRole(rawRole, "therapist");

      return {
        service_name: String(raw.service_name ?? "").trim(),
        category,
        price: Number(raw.price) || 0,
        duration: Number(raw.duration) || 0,
        buffer_time: Number(raw.buffer_time) || 0,
        executor_role
      };
    });



    // -------------------- rooms.csv 清洗 --------------------
    this.rooms = (rawRooms || []).map((raw: any): RoomRecord => {
      const roomType = (raw.room_type ?? "").trim() as RoomType;
      return {
        room_name: String(raw.room_name ?? "").trim(),
        room_type: roomType,
        status: String(raw.status ?? "").trim(),
      };
    });



    // -------------------- equipment.csv 清洗 --------------------
    this.equipment = (rawEquipment || []).map((raw: any): EquipmentRecord => {
      const equipmentType = (raw.equipment_type ?? "").trim() as EquipmentType;
      return {
        equipment_name: String(raw.equipment_name ?? "").trim(),
        equipment_type: equipmentType,
        room_name: String(raw.room_name ?? "").trim(),
        status: String(raw.status ?? "").trim(),
      };
    });



    // -------------------- staff.csv 清洗 --------------------


    this.staff = (rawStaff || []).map((raw: any): StaffRecord => {
      const staffType = (raw.staff_type ?? "").trim() as StaffType;
      
      // 嘗試多種可能的 status 欄位名稱
      let status = "";
      const possibleStatusKeys = ["status", "Status", "STATUS", "status ", " status"];
      for (const key of possibleStatusKeys) {
        if (raw[key] !== undefined) {
          status = String(raw[key]).trim();
          break;
        }
      }
      
      return {
        staff_name: String(raw.staff_name ?? "").trim(),
        staff_type: staffType,
        specialty: String(raw.specialty ?? "").trim(),
        skill_level: String(raw.skill_level ?? "").trim(),
        certified_services: String(raw.certified_services ?? "").trim(),
        status: status,
      };
    });



    // -------------------- staff_workload.csv 清洗 --------------------
    this.staffWorkload = (rawStaffWorkload || []).map(
      (raw: any): StaffWorkloadRecord => {
        const actionType = (raw.action_type ?? "").trim() as StaffActionType;
        
        // 🔧 修正：處理欄位名稱可能有空格或 \r 的問題
        // 嘗試多種可能的欄位名稱
        let countRaw = raw.count ?? raw["count "] ?? raw["count\r"] ?? raw["count \r"] ?? "";
        if (typeof countRaw === "string") {
          countRaw = countRaw.replace(/\r/g, "").trim();
        }
        const countValue = Number(countRaw) || 0;
        
        return {
          date: String(raw.date ?? "").trim(), // "2025-12-04"
          staff_name: String(raw.staff_name ?? "").trim(),
          action_type: actionType,
          count: countValue,
        };
      }
    );



    // -------------------- package_usage.csv 清洗 --------------------
    // 如果 CSV 沒有 customer_id，就依照 customer_name 自動生成 CUS001, CUS002...
    const customerIdMap = new Map<string, string>();
    let customerCounter = 1;
    const getCustomerId = (name: string, rawId?: string): string => {
      const trimmedId = String(rawId ?? "").trim();
      if (trimmedId) return trimmedId;

      const trimmedName = name.trim();
      if (customerIdMap.has(trimmedName)) {
        return customerIdMap.get(trimmedName)!;
      }
      const id = "CUS" + String(customerCounter).padStart(3, "0");
      customerIdMap.set(trimmedName, id);
      customerCounter++;
      return id;
    };

    this.packageUsage = (rawPackageUsage || []).map(
      (raw: any): PackageUsageRecord => {
        const customerName = String(raw.customer_name ?? "").trim();
        const customerId = getCustomerId(customerName, raw.customer_id);

        return {
          customer_id: customerId,
          customer_name: customerName,
          service_name: String(raw.service_name ?? "").trim(),
          total_sessions: Number(raw.total_sessions) || 0,
          used_sessions: Number(raw.used_sessions) || 0,
          remaining_sessions: Number(raw.remaining_sessions) || 0,
          last_used_date: String(raw.last_used_date ?? "").trim(), // "YYYY-MM-DD"
        };
      }
    );


   
    // -------------------- customers.csv 清洗 --------------------
    this.customers = (rawCustomers || []).map((raw: any): CustomerRecord => {
      return {
        customer_id: String(raw.customer_id ?? "").trim(),
        gender: String(raw.gender ?? "").trim(),
        age: Number(raw.age) || 0,
        birth_year: Number(raw.birth_year) || 0,
        age_group: String(raw.age_group ?? "").trim(),
        first_visit_date: String(raw.first_visit_date ?? "").trim(),
        last_visit_date: String(raw.last_visit_date ?? "").trim(),
        visit_count: Number(raw.visit_count) || 0,
      };
    });

    console.log("[DataStore] All CSVs loaded and cleaned.");
  }

  /**
   * 萬用大表匯入處理 (Universal Master Import)
   * logic:
   * 1. Parse rows -> AppointmentRecord
   * 2. Staff Auto-Registration (Doctor/Nurse)
   * 3. Task Auto-Creation (Compliance)
   * 4. Update Revenue & Stats
   */
  async handleMasterImport(rawRows: any[]) {
      console.log(`[DataStore] Handling Master Import: ${rawRows.length} rows`);
      
      const newAppointments: AppointmentRecord[] = [];
      const today = new Date().toISOString().split('T')[0];
      
      let importCount = 0;
      let revenueDelta = 0;

      // Dynamic import to avoid circular dependency issues if any
      const { TaskStore } = await import("./taskStore.js");

      for (const row of rawRows) {
          // 1. Map Fields
          // Expected Keys: appointment_id, date, customer_id, gender, age, is_new, service_item, purchased_amount, doctor_name, staff_name, status...
          // Keys might be lowercased by caller
          
          const get = (k: string) => (row[k] || row[k.toLowerCase()] || "").trim();
          
          const date = get('date') || today;
          const serviceItem = get('service_item');
          if (!serviceItem) continue; // Skip invalid
          
          const docName = get('doctor_name') || '未指定';
          const staffName = get('staff_name');
          const amountStr = get('purchased_amount') || get('amount');
          let amount = amountStr ? parseFloat(amountStr) : undefined;
          if (amount !== undefined && isNaN(amount)) amount = 0; // Safety for invalid numbers
          
          // 2. Data Record
          const rec: AppointmentRecord = {
              appointment_id: get('appointment_id') || `IMP-${Date.now()}-${importCount}`,
              date: date,
              time: '12:00:00', // Default
              customer_id: get('customer_id') || `CUS-New-${importCount}`,
              age: parseInt(get('age')) || 30,
              gender: (get('gender').toLowerCase() === 'male') ? 'male' : 'female',
              is_new: (get('is_new').toLowerCase() === 'yes') ? 'yes' : 'no',
              service_item: serviceItem,
              purchased_services: get('purchased_services') || serviceItem,
              doctor_name: docName,
              staff_role: '' as StaffType, // Will try to map below
              status: (get('status').toLowerCase() || 'completed') as AppointmentStatus,
              room: get('room'),
              equipment: get('equipment'),
              amount: amount, // Optional field
              customer: undefined,
              service: undefined,
              doctor: undefined
          };

          // 3. Staff Registration (Dynamic Mapping)
          // Doctor
          if (docName && docName !== 'nan') {
              const existingDoc = this.staff.find(s => s.staff_name === docName);
              if (!existingDoc) {
                  this.staff.push({
                      staff_name: docName,
                      staff_type: 'doctor',
                      specialty: 'General',
                      status: 'active'
                  });
                  console.log(`[DataStore] Auto-registered new Doctor: ${docName}`);
              }
          }

          // Staff (Therapist/Nurse)
          if (staffName && staffName !== 'nan') {
              // Try to map to existing
              const existingStaff = this.staff.find(s => s.staff_name === staffName);
              if (!existingStaff) {
                   // Default to Nurse for safety
                   this.staff.push({
                      staff_name: staffName,
                      staff_type: 'nurse', // Default
                      specialty: 'Support',
                      status: 'active'
                  });
                  console.log(`[DataStore] Auto-registered new Staff: ${staffName}`);
              }
              
              const finalStaff = this.staff.find(s => s.staff_name === staffName);
              if (finalStaff) {
                  rec.staff_role = finalStaff.staff_type;
              }
          }

          // 4. Task Creation (Compliance Check)
          // "service_item ➔ 存入 TaskStore 以供 AI 合規檢查 使用"
          const existingTask = TaskStore.getTasks().find(t => t.title.includes(serviceItem));
          if (!existingTask) {
               TaskStore.addTask({
                   title: `[AI合規] 服務項目檢核：${serviceItem}`,
                   description: `系統檢測到新服務項目「${serviceItem}」。請確認醫療廣告法規遵循狀況。\n來源：萬用報表匯入`,
                   targetPage: 'services',
                   dueDate: today,
                   reminders: [1]
               });
               console.log(`[DataStore] Auto-created Compliance Task for: ${serviceItem}`);
          }

          newAppointments.push(rec);
          importCount++;
          if (amount) revenueDelta += amount;
      }
      
      // Update Main Store
      this.appointments = [...this.appointments, ...newAppointments];
      
      console.log(`[DataStore] Import Complete. Added ${importCount} records. Revenue Delta: ${revenueDelta}`);
      return { count: importCount, revenue: revenueDelta };
  }
}

export const dataStore = new DataStore();
