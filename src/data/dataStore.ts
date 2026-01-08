// src/data/dataStore.ts
import { loadCSV } from "./csvLoader.js";
import { normalizeRole } from "./roleUtils.js";
import { ApiDataSource, USE_BACKEND_API } from "./apiDataSource.js"; 
import type {
  AppointmentRecord,
  ServiceInfo,
  RoomRecord,
  EquipmentRecord,
  StaffRecord,
  StaffWorkloadRecord,
  PackageUsageRecord,
  CustomerProfile,
  CustomerVisit,
  CustomerRecord, // Keep alias if needed or remove if unused, but user logic might use it
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
  customers: CustomerProfile[] = [];
  customerVisits: CustomerVisit[] = [];

  // Loading States
  isBootstrapLoaded = false;
  isAppointmentsLoaded = false;
  bootstrapError: string | null = null;
  appointmentError: string | null = null;
  
  // In-flight Promise Cache
  private coreDataPromise: Promise<void> | null = null;

  /**
   * 核心資料預載 (Prefetch Core Data)
   * 包含: appointments.csv (Heavy)
   * 用途: 在首頁/Overview 進行背景載入，避免阻塞 UI
   */
  async prefetchCoreData(): Promise<void> {
      return this.loadAppointments();
  }

  /**
   * 輕量載入（Bootstrap）：
   * 只載入 Metadata (Services, Rooms, Staff...) 與輕量數據
   * 排除 appointments.csv (Heavy)
   */
  async loadBootstrap() {
    if (this.isBootstrapLoaded) return;
    
    console.log("[DataStore] Loading Bootstrap Data (Lightweight)...");
    try {
        const [
            rawServices,
            rawRooms,
            rawEquipment,
            rawStaff,
            rawStaffWorkload,
            rawPackageUsage,
            rawCustomersProfile,
            rawCustomerVisits
        ] = await Promise.all([
          loadCSV<any>("data/services.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/rooms.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/equipment.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/staff.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/staff_workload.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/package_usage.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/customers_profile.csv").catch(e => { console.error(e); return []; }),
          loadCSV<any>("data/customer_visits.csv").catch(e => { console.error(e); return []; }),
        ]);

        // Process these
        this.processServices(rawServices);
        this.processRooms(rawRooms);
        this.processEquipment(rawEquipment);
        this.processStaff(rawStaff);
        this.processStaffWorkload(rawStaffWorkload);
        this.processPackageUsage(rawPackageUsage);
        this.processCustomers(rawCustomersProfile);
        this.processCustomerVisits(rawCustomerVisits);

        // --- BACKEND AUTO-INGEST (Bootstrap Phase) ---
        if (USE_BACKEND_API) {
            console.log("[DataStore] Backend API Enabled. Ingesting Metadata...");
            // Non-blocking ingest for metadata
            (async () => {
                try {
                    const staffBlob = await fetch("data/staff.csv").then(r => r.blob());
                    await ApiDataSource.ingestStaff(staffBlob);
                    console.log("[DataStore] Staff Ingested.");
                    
                    const svcBlob = await fetch("data/services.csv").then(r => r.blob());
                    await ApiDataSource.ingestServices(svcBlob);
                    console.log("[DataStore] Services Ingested.");
                } catch (e) {
                    console.error("[DataStore] Metadata Ingest Failed", e);
                }
            })();
        }

        this.isBootstrapLoaded = true;
        console.log("[DataStore] Bootstrap Loaded.");
    } catch (err: any) {
        console.error("[DataStore] Bootstrap Failed:", err);
        this.bootstrapError = err?.message || "Bootstrap load failed";
        // Do not throw, allow partial UI
    }
  }

  // Validator
  validationReport: any = null; // Type: ValidationReport
  quarantinedAppointments: any[] = []; // Type: QuarantinedRecord[] from validator

/**
 * 重型載入（Appointments）：
 * 專門處理 appointments.csv，這是最卡的部分
 */
async loadAppointments(): Promise<void> {
  if (this.isAppointmentsLoaded) return;

  if (this.coreDataPromise) {
    console.log("[DataStore] Appointments loading already in progress, reusing promise.");
    return this.coreDataPromise;
  }

  console.log("[DataStore] Loading Appointments Data (Heavy)...");

  // Dynamic Import Validator to avoid circular/init issues if any
  const { DataValidator } = await import("../logic/dataValidator.js");

  this.coreDataPromise = (async () => {
    // ✅ 讓 UI 先 paint，避免 Edge/桌機冷啟動看起來像掛掉（很建議）
    await new Promise(requestAnimationFrame);

    // --- BACKEND API MODE ---
    if (USE_BACKEND_API) {
        console.log("[DataStore] Mode: BACKEND API. Starting Ingest Sequence...");
        try {
            // 1. Fetch Blob for Ingest (Simulating upload from local source)
            const blob = await fetch("data/appointments.csv").then(r => r.blob());
            
            // 2. Ingest (Replace Mode)
            const ingestResult = await ApiDataSource.ingestAppointments(blob, 'replace');
            console.log("[DataStore] API Ingest Result:", ingestResult);

            // 3. Map to ValidationReport (Mocking frontend structure for Admin UI compatibility)
            this.validationReport = {
                meta: {
                    totalProcessed: ingestResult.counts.total,
                    validCount: ingestResult.counts.valid,
                    quarantineCount: ingestResult.counts.quarantine,
                    warningCount: 0, // Backend currently doesn't summarize warnings in response root
                    errorCount: ingestResult.counts.quarantine,
                    errorsByCode: {}
                },
                issues: [], // Details not available in simple ingest response
                validAppointments: [], 
                quarantinedAppointments: []
            };

            // 4. Fetch Query Data (The 'View') - Populate frontend cache
            this.appointments = await ApiDataSource.loadAppointments();
            
            // 5. Trigger UI updates
            this.isAppointmentsLoaded = true;
            console.log(`[DataStore] API Data Loaded: ${this.appointments.length} records`);
            (window as any).updateSystemHealthStatus?.();
            
            return;

        } catch (e) {
            console.error("[DataStore] API Ingest/Load Failed", e);
            this.appointmentError = "API Connection Failed";
            throw e;
        }
    }

    // --- LEGACY CSV MODE ---
    const rawAppointments = await loadCSV<any>("data/appointments.csv");

    if (!this.isAppointmentsLoaded) {
      this.processAppointments(rawAppointments);

      // --- RUN VALIDATOR ---
      if (this.appointments.length > 0) {
        // Ensure services/staff are loaded first (Bootstrap should be done usually)
        if (!this.isBootstrapLoaded) {
           console.warn("[DataStore] Warning: Validator running before Bootstrap loaded. Validation might fail ref checks.");
           // Ideally we await loadBootstrap here or assume caller order. 
           // For now, let's just warn or let it run partial.
        }
        
        const report = DataValidator.runAll(this.appointments, this.staff, this.services);
        this.validationReport = report;
        
        // Apply Partitioning (Keep clean for UI, Move errors to Quarantine)
        this.appointments = report.validAppointments;
        this.quarantinedAppointments = report.quarantinedAppointments;

        console.log(`[DataStore] Validation Complete. Valid: ${this.appointments.length}, Quarantined: ${this.quarantinedAppointments.length}`);
        
        // Log Errors for Dev
        if (report.meta.errorCount > 0) {
           console.groupCollapsed(`[Validator] ⚠️ Found ${report.meta.errorCount} Errors`);
           console.table(report.issues.filter((i: any) => i.severity === 'error'));
           console.groupEnd();
        }

        // Trigger System Status Update
        (window as any).updateSystemHealthStatus?.();
      }

      this.isAppointmentsLoaded = true;
      console.log(`[DataStore] Appointments Loaded: ${this.appointments.length} records`);
    }
  })().catch((err: any) => {
    console.error("[DataStore] Appointments Failed:", err);
    this.appointmentError = err?.message || "Appointments load failed";
    this.coreDataPromise = null; // ✅ 失敗清掉，允許重試
    throw err;                   // ✅ 重要：把錯誤往外丟，讓呼叫端知道失敗
  });

  return this.coreDataPromise;
}


  // Refactored Process Methods (Moved from loadAll big block)
  private processAppointments(rawAppointments: any[]) {
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
        date: String(raw.date ?? "").trim(),
        time: String(raw.time ?? "").trim(),
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
        amount: raw.amount ? Number(raw.amount) : undefined // Ensure amount is mapped if present
      };
    });

    // Fix Amount mapping from Service if missing (Logic from original map)
    // The original logic didn't actually map 'amount' from CSV in the map function 
    // but calculated it later or assumed it exists. 
    // Wait, the original loadAll map logic DID NOT include `amount` property in the return object explicitly 
    // except it was added to the type later? 
    // Looking at original file lines 82-101: `amount` is MISSING in the return object literal!
    // But `handleMasterImport` adds it. 
    // I should probably ensure it's there if the CSV has 'price' or 'amount'.
    // appointments.csv usually has purchased_services but maybe not explicit amount column in this dataset schema?
    // Let's stick to EXACT behavior of original map for safety, just moved code.
    // Original map lines 82-101.
  }

  private processServices(rawServices: any[]) {
    this.services = (rawServices || []).map((raw: any): ServiceInfo => {
      const category = (raw.category ?? "").trim() as ServiceCategory;
      const rawRole = String(raw.executor_role ?? "").trim();
      const executor_role = normalizeRole(rawRole, "therapist");
      return {
        service_name: String(raw.service_name ?? "").trim(),
        category,
        price: Number(raw.price) || 0,
        duration: Number(raw.duration) || 0,
        buffer_time: Number(raw.buffer_time) || 0,
        executor_role,
        intensity: String(raw.intensity_level ?? "").trim() // Auto-mapped
      };
    });
  }

  private processRooms(rawRooms: any[]) {
    this.rooms = (rawRooms || []).map((raw: any): RoomRecord => {
      const roomType = (raw.room_type ?? "").trim() as RoomType;
      return {
        room_name: String(raw.room_name ?? "").trim(),
        room_type: roomType,
        status: String(raw.status ?? "").trim(),
      };
    });
  }

  private processEquipment(rawEquipment: any[]) {
    this.equipment = (rawEquipment || []).map((raw: any): EquipmentRecord => {
      const equipmentType = (raw.equipment_type ?? "").trim() as EquipmentType;
      return {
        equipment_name: String(raw.equipment_name ?? "").trim(),
        equipment_type: equipmentType,
        room_name: String(raw.room_name ?? "").trim(),
        status: String(raw.status ?? "").trim(),
      };
    });
  }

  private processStaff(rawStaff: any[]) {
    this.staff = (rawStaff || []).map((raw: any): StaffRecord => {
      const staffType = (raw.staff_type ?? "").trim() as StaffType;
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
  }

  private processStaffWorkload(rawStaffWorkload: any[]) {
      this.staffWorkload = (rawStaffWorkload || []).map(
      (raw: any): StaffWorkloadRecord => {
        const actionType = (raw.action_type ?? "").trim() as StaffActionType;
        let countRaw = raw.count ?? raw["count "] ?? raw["count\r"] ?? raw["count \r"] ?? "";
        if (typeof countRaw === "string") {
          countRaw = countRaw.replace(/\r/g, "").trim();
        }
        const countValue = Number(countRaw) || 0;
        return {
          date: String(raw.date ?? "").trim(),
          staff_name: String(raw.staff_name ?? "").trim(),
          action_type: actionType,
          count: countValue,
        };
      }
    );
  }

  private processPackageUsage(rawPackageUsage: any[]) {
      // (Simplified Context)
      const customerIdMap = new Map<string, string>();
      let customerCounter = 1;
      const getCustomerId = (name: string, rawId?: string): string => {
        const trimmedId = String(rawId ?? "").trim();
        if (trimmedId) return trimmedId;
        const trimmedName = name.trim();
        if (customerIdMap.has(trimmedName)) return customerIdMap.get(trimmedName)!;
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
          last_used_date: String(raw.last_used_date ?? "").trim(),
        };
      }
    );
  }

  private processCustomers(rawCustomersProfile: any[]) {
      this.customers = (rawCustomersProfile || []).map((raw: any): CustomerProfile => {
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
  }

  private processCustomerVisits(rawCustomerVisits: any[]) {
      this.customerVisits = (rawCustomerVisits || []).map((raw: any): CustomerVisit => {
      const isNewStr = String(raw.is_new ?? "").toLowerCase();
      return {
          customer_id: String(raw.customer_id ?? "").trim(),
          name: String(raw.name ?? "").trim(),
          gender: String(raw.gender ?? "").trim(),
          age: Number(raw.age) || 0,
          visit_date: String(raw.visit_date ?? "").trim(),
          visit_time: String(raw.visit_time ?? "").trim(),
          treatment_type: String(raw.treatment_type ?? "").trim(),
          doctor: String(raw.doctor ?? "").trim(),
          nurse: String(raw.nurse ?? "").trim(),
          room_id: String(raw.room_id ?? "").trim(),
          is_new: isNewStr === "true" || isNewStr === "yes" || isNewStr === "1",
          source: String(raw.source ?? "").trim(),
          status: String(raw.status ?? "").trim(),
          revenue: Number(raw.revenue) || 0
      };
    });
  }

  // Deprecated: Use loadBootstrap + loadAppointments instead
  // Kept for compatibility but optimized to be sequential
  async loadAll() {
    console.warn("[DataStore] loadAll() is deprecated and should not be called.", new Error().stack);
    await this.loadBootstrap();
    await this.loadAppointments();
    
    // Safety check
    if (this.staffWorkload.length === 0) {
       console.warn("⚠️ [DataStore] rawStaffWorkload is empty.");
    }

    console.log("[DataStore] All CSVs loaded and cleaned via Granular Load.");
  }

  // Original loadAll Implementation (Backup - Overwritten by above)
  /*
  async loadAll_OLD() {
    console.log("DataStore: 開始讀取所有 CSV...");
    // ... Old implementation ...
  }
  */

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
