import { z } from "zod";
import { AppointmentRecord, StaffRecord, ServiceInfo } from "../data/schema";

// ==========================================
// 1. Zod Basic Schemas
// ==========================================

// Helper Regex
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;

// Status Enum for KPI Logic
export const KPI_VALID_STATUSES = ["completed", "paid", "booked", "checked_in"] as const;
export const IGNORED_STATUSES = ["cancelled", "no_show", "refunded", "error"] as const;

export const KPI_REVENUE_STATUSES = new Set(["completed", "paid", "checked_in"]);
export const KPI_EXCLUDE_STATUSES = new Set(["cancelled", "no_show", "refunded", "error"]);

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  dataset: 'appointments' | 'staff' | 'services';
  rowIndex: number;
  id: string; 
  field: string;
  code: 'schema_error' | 'ref_error' | 'logic_error' | 'dup_error';
  message: string;
  severity: ValidationSeverity;
  suggestedFix?: string;
}

export interface QuarantinedRecord {
  record: AppointmentRecord;
  rowIndex: number;
  reasons: string[]; // List of error messages main reasons
}

export interface ValidationReport {
  snapshotId: string;
  timestamp: string;
  issues: ValidationIssue[];
  validAppointments: AppointmentRecord[];
  quarantinedAppointments: QuarantinedRecord[]; // Richer object
  meta: {
    totalProcessed: number;
    errorCount: number;
    warningCount: number;
    validCount: number;
    quarantineCount: number;
    errorsByCode: Record<string, number>;
    importId?: string;
    mode?: string;
  }
}

// Helper: Normalize service strings
// 1. Full-width to half-width
// 2. Uniform split
// 3. Trim
function normalizeServiceList(raw: string | undefined | null): string[] {
    if (!raw) return [];
    return raw
        .replace(/，/g, ',')
        .replace(/；/g, ';')
        .split(/[;,]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

// --- Service Schema ---
const ServiceSchema = z.object({
  service_name: z.string().min(1, "Service name is required"),
  category: z.string(),
  price: z.number().min(0, "Price cannot be negative"),
  duration: z.number().int().positive("Duration must be positive minutes"),
  buffer_time: z.number().int().min(0).default(0),
  executor_role: z.string().optional(),
  intensity_level: z.string().optional(),
  transferable: z.string().optional()
});

// --- Staff Schema ---
const StaffSchema = z.object({
  staff_name: z.string().min(1, "Staff name is required"),
  staff_type: z.enum(["doctor", "nurse", "therapist", "consultant", "admin", "other"]).or(z.string()),
  status: z.string().optional(),
  certified_services: z.string().optional() // Could be split/array check later
});

// --- Appointment Schema (Row Level) ---
// Note: Input is likely raw strings/mixed from CSV, but DataStore types are already partially typed.
// We will validate the *Record* object provided by DataStore.
const AppointmentRowSchema = z.object({
  appointment_id: z.string().min(1),
  date: z.string().regex(DATE_REGEX, "Invalid date format (YYYY-MM-DD)"),
  time: z.string().regex(TIME_REGEX, "Invalid time format (HH:mm)"),
  age: z.number().min(0).max(120).optional(),
  gender: z.enum(["male", "female", "other"]).or(z.string()).optional(),
  is_new: z.union([z.boolean(), z.string()]).transform(val => {
    if (typeof val === 'boolean') return val;
    return val?.toLowerCase() === 'yes' || val?.toLowerCase() === 'true';
  }),
  status: z.string().toLowerCase(),
  purchased_services: z.string().optional(),
  service_item: z.string().optional(),
  doctor_name: z.string().optional(),
  staff_role: z.string().optional(),
  room: z.string().optional(),
  equipment: z.string().optional(),
  customer_id: z.string().optional()
}).superRefine((data, ctx) => {
  // Logic 3: purchased_services vs service_item
  const hasPurchased = !!data.purchased_services && data.purchased_services.trim() !== "";
  const hasItem = !!data.service_item && data.service_item.trim() !== "";
  
  const isCompletedOrPaid = ["completed", "paid", "checked_in"].includes(data.status);

  // If completed/paid, must have at least one service
  if (isCompletedOrPaid && !hasPurchased && !hasItem) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Completed/Paid appointment must have a service item or purchased service.",
      path: ["service_item"],
      params: { severity: "error" } // Custom param for our parser
    });
  }

  // If both exist, service_item should ideally be in purchased_services (consistency)
  // But purchased_services might be a list "A; B; C"
  if (hasItem && hasPurchased) {
    if (!data.purchased_services!.includes(data.service_item!)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Service item '${data.service_item}' not found in purchased list '${data.purchased_services}'`,
        path: ["service_item"],
        params: { severity: "warning" }
      });
    }
  }
});


// ==========================================
// 2. Validator Class
// ==========================================

export class DataValidator {
  
  static runAll(
    appointments: AppointmentRecord[], 
    staffList: StaffRecord[], 
    serviceList: ServiceInfo[],
    config: { strictMode: boolean } = { strictMode: false }
  ): ValidationReport {
    
    const startTime = Date.now();
    const snapshotId = `VAL-${startTime}`;
    
    const issues: ValidationIssue[] = [];
    const validAppointments: AppointmentRecord[] = [];
    const quarantinedAppointments: QuarantinedRecord[] = [];
    
    // Stats
    const errorsByCode: Record<string, number> = {};
    const trackError = (code: string) => {
        errorsByCode[code] = (errorsByCode[code] || 0) + 1;
    };

    // Pre-computation (Already doing this, but ensure robustness)
    const doctorSet = new Set(
      staffList
        .filter(s => (s.staff_type as string)?.toLowerCase() === 'doctor')
        .map(s => s.staff_name.trim())
    );
    
    const allStaffMap = new Map(staffList.map(s => [s.staff_name.trim(), s]));
    const serviceMap = new Map(serviceList.map(s => [s.service_name.trim(), s]));
    
    const seenIds = new Set<string>();

    // Current Date for Reasonability Check
    const today = new Date();
    const minDate = new Date(); minDate.setFullYear(today.getFullYear() - 2);
    const maxDate = new Date(); maxDate.setFullYear(today.getFullYear() + 2);

    // --- Validate Appointments ---
    appointments.forEach((row, index) => {
      const rowIssues: ValidationIssue[] = [];
      let isError = false;
      
      const rowId = row.appointment_id || `ROW-${index}`;

      // 1. Uniqueness Check (Critical)
      if (seenIds.has(rowId)) {
          isError = true;
          rowIssues.push({
             dataset: 'appointments',
             rowIndex: index,
             id: rowId,
             field: 'appointment_id',
             code: 'dup_error',
             message: `Duplicate Appointment ID detected: ${rowId}`,
             severity: 'error'
          });
          trackError('DUP_APPOINTMENT_ID');
      } else {
          seenIds.add(rowId);
      }

      // 2. Schema & Logic (Enhanced)
      //    Date/Time Parsing & Range
      const dateStr = row.date;
      const parsedDate = new Date(dateStr);
      if (isNaN(parsedDate.getTime())) {
           isError = true;
           rowIssues.push({
               dataset: 'appointments', 
               rowIndex: index, id: rowId, field: 'date', code: 'schema_error',
               message: `Invalid Date Format: ${dateStr}`, severity: 'error'
           });
           trackError('INVALID_DATE_FORMAT');
      } else {
           if (parsedDate < minDate || parsedDate > maxDate) {
               rowIssues.push({
                   dataset: 'appointments', 
                   rowIndex: index, id: rowId, field: 'date', code: 'logic_error',
                   message: `Date ${dateStr} is outside reasonable range (+/- 2 years)`, severity: 'warning'
               });
               trackError('DATE_OUT_OF_RANGE');
           }
      }

      // 3. String Normalization & Service Logic
      const purchasedServices = normalizeServiceList(row.purchased_services);
      const serviceItem = row.service_item?.trim();
      const status = row.status?.toLowerCase();
      
      const isPaidOrCompleted = KPI_REVENUE_STATUSES.has(status as string);

      if (isPaidOrCompleted && purchasedServices.length === 0 && !serviceItem) {
          // Warning or Error depending on strictness. User said "must have one".
          rowIssues.push({
              dataset: 'appointments', rowIndex: index, id: rowId, field: 'service_item',
              code: 'logic_error', message: 'Revenue status but no service recorded', severity: 'error'
          });
          isError = true;
          trackError('MISSING_SERVICE_IN_REVENUE');
      }

      // Check inclusion
      if (serviceItem && purchasedServices.length > 0) {
          // Ideally serviceItem should be in purchasedServices
          // But strict check might fail on "Pico" vs "Pico Laser". 
          // We assume exact match or simple inclusion for now
          // If NOT found:
          if (!purchasedServices.includes(serviceItem)) {
              rowIssues.push({
                  dataset: 'appointments', rowIndex: index, id: rowId, field: 'service_item',
                  code: 'logic_error', message: `Service Item '${serviceItem}' mismatch with Purchased list`, severity: 'warning'
              });
          }
      }

      // 4. Role Consistency (User Request Point 1)
      if (serviceItem && serviceMap.has(serviceItem)) {
          const serviceDef = serviceMap.get(serviceItem)!;
          const requiredRole = serviceDef.executor_role; // e.g. "doctor", "therapist"
          
          if (requiredRole) {
              const actualRole = row.staff_role; // e.g. "doctor"
              const actualStaffName = row.staff_name || row.doctor_name; // Fallback logic logic
              
              if (actualRole && actualRole.toLowerCase() !== requiredRole.toLowerCase()) {
                   // Allow compatibility? e.g. Doctor can do Nurse job? 
                   // User said: "service.executor_role=Doctor -> staff_role MUST be Doctor"
                   // But maybe Doctor can do Therapist job?
                   // For now, strict match as requested "Example: role must match"
                   rowIssues.push({
                       dataset: 'appointments', rowIndex: index, id: rowId, field: 'staff_role',
                       code: 'logic_error', message: `Role Mismatch: Service '${serviceItem}' requires '${requiredRole}', but record has '${actualRole}'`, severity: 'warning'
                   });
                   trackError('ROLE_MISMATCH');
              }
          }
      }

      // 5. Doctor Referential Check
      if (row.doctor_name && row.doctor_name !== 'nan' && row.doctor_name !== '') {
          const docName = row.doctor_name.trim();
          if (!doctorSet.has(docName)) {
             // Maybe it's a staff but not marked as doctor in staff.csv
             if (allStaffMap.has(docName)) {
                 const actualType = allStaffMap.get(docName)?.staff_type;
                 rowIssues.push({
                    dataset: 'appointments', rowIndex: index, id: rowId, field: 'doctor_name',
                    code: 'ref_error', message: `Staff '${docName}' is type '${actualType}', expected 'doctor'`, severity: 'error' // Upgraded to error as requested implies strictness
                 });
                 isError = true; 
                 trackError('DOCTOR_TYPE_MISMATCH');
             } else {
                 rowIssues.push({
                    dataset: 'appointments', rowIndex: index, id: rowId, field: 'doctor_name',
                    code: 'ref_error', message: `Doctor '${docName}' not found in Staff Directory`, severity: 'error'
                 });
                 isError = true;
                 trackError('UNKNOWN_DOCTOR');
             }
          }
      }

      // Collect Issues
      if (rowIssues.length > 0) {
        issues.push(...rowIssues);
      }

      // Quarantine Decision
      if (isError) {
        quarantinedAppointments.push({
            record: row,
            rowIndex: index,
            reasons: rowIssues.filter(i => i.severity === 'error').map(i => i.message)
        });
      } else {
        validAppointments.push(row);
      }

    });

    const errorCount = issues.filter(i => i.severity === 'error').length;
    
    // Console Summary (User Request 7)
    console.group(`[DataValidator] Summary (Snapshot: ${snapshotId})`);
    console.log(`Total: ${appointments.length}`);
    console.log(`Valid: ${validAppointments.length}`);
    console.log(`Quarantined: ${quarantinedAppointments.length}`);
    console.log(`Errors breakdown:`, errorsByCode);
    console.groupEnd();

    return {
      snapshotId,
      timestamp: new Date().toISOString(),
      issues,
      validAppointments,
      quarantinedAppointments, // Now structured
      meta: {
        totalProcessed: appointments.length,
        errorCount,
        warningCount: issues.filter(i => i.severity === 'warning').length,
        validCount: validAppointments.length,
        quarantineCount: quarantinedAppointments.length,
        errorsByCode
      }
    };
  }
}
