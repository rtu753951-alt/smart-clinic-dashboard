import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto"; // Added for SHA-256
import { z } from "zod";
import { 
  AppointmentRowSchema, 
  StaffSchema, 
  ServiceSchema,
  ValidationReport,
  ValidationIssue
} from "@clinic/shared";

const prisma = new PrismaClient();

// Enums (Manual Definition for SQLite Compatibility)
enum ImportStatus {
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed"
}

enum DatasetType {
  APPOINTMENTS = "appointments",
  STAFF = "staff",
  SERVICES = "services",
  ROOMS = "rooms",
  EQUIPMENT = "equipment",
  TASKS = "tasks"
}

enum ImportSource {
  UPLOAD_CSV = "upload_csv",
  GOOGLE_SHEETS = "google_sheets",
  MANUAL = "manual",
  SYSTEM = "system"
}

enum ImportMode {
  APPEND = "append",
  REPLACE = "replace",
  UPSERT = "upsert"
}

export class IngestService {
  
  private static calculateHash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  static async ingestStaff(fileBuffer: Buffer, filename: string) {
    const importId = uuidv4();
    const start = new Date();
    const fileHash = this.calculateHash(fileBuffer);

    // Idempotency Check (Appointments)
const existing = await prisma.import.findFirst({
  where: {
    dataset: DatasetType.STAFF,
    mode: ImportMode.UPSERT,
    file_hash: fileHash,
    status: ImportStatus.COMPLETED,
  },
  select: { id: true, imported_at: true, filename: true },
});

if (existing) {
  return {
    duplicated: true,
    existing_import_id: existing.id,
    message: `Same file already imported (import_id=${existing.id})`,
  };
}


    // 1. Create Job Record
    await prisma.import.create({
        data: {
        id: importId,
        filename,
        file_hash: fileHash,
        status: ImportStatus.RUNNING,
        dataset: DatasetType.STAFF,
        source: ImportSource.UPLOAD_CSV,
        mode: ImportMode.UPSERT, // Staff uses upsert logic
        started_at: start,
        report_json: JSON.stringify({ issues: [] })

        }
    });

    try {
        const rawRecords = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true
        });

        const validData: any[] = [];
        // Staff/Service usually rigid, assume all valid or strictly skipped
        
        // Process each row
        for (const row of rawRecords) {
            // StaffSchema validation
            const result = StaffSchema.safeParse(row);
            if (result.success) {
                validData.push({ ...result.data, id: uuidv4() });
            } else {
                console.warn(`Skipping invalid staff row: ${JSON.stringify(row)}`, result.error);
            }
        }

        // Upsert Operations
        const upsertPromises = validData.map(s => {
            return prisma.staff.upsert({
                where: { staff_name: s.staff_name },
                update: {
                    staff_type: s.staff_type,
                    specialty: s.specialty,
                    skill_level: s.skill_level,
                    certified_services: s.certified_services,
                    status: s.status || 'active'
                },
                create: {
                    id: s.id,
                    staff_name: s.staff_name,
                    staff_type: s.staff_type,
                    specialty: s.specialty,
                    skill_level: s.skill_level,
                    certified_services: s.certified_services,
                    status: s.status || 'active'
                }
            });
        });

        await prisma.$transaction(upsertPromises);

        const end = new Date();
        const duration = end.getTime() - start.getTime();

        // 2. Update Job Success
        await prisma.import.update({
            where: { id: importId },
            data: {
                status: ImportStatus.COMPLETED,
                valid_count: validData.length,
                finished_at: end,
                duration_ms: duration,
                report_json: JSON.stringify({ message: "Staff import completed" })
            }
        });

        return {
        importId,
        status: "completed",
        counts: {
            total: rawRecords.length,
            valid: validData.length,
            quarantine: 0
        }
        };

    } catch (error: any) {
        // 3. Update Job Failure
        await prisma.import.update({
            where: { id: importId },
            data: {
                status: ImportStatus.FAILED,
                error_summary: error.message || "Unknown error",
                finished_at: new Date()
            }
        });
        throw error;
    }
  }

  static async ingestServices(fileBuffer: Buffer, filename: string) {
    const importId = uuidv4();
    const start = new Date();
    const fileHash = this.calculateHash(fileBuffer);

    const existing = await prisma.import.findFirst({
        where: {
            dataset: DatasetType.SERVICES,
            mode: ImportMode.UPSERT,
            file_hash: fileHash,
            status: ImportStatus.COMPLETED
        }
    });

    if (existing) {
        throw {
            code: "DUPLICATE_IMPORT",
            message: `File content already imported as Job ${existing.id}`,
            importId: existing.id
        };
    }

    await prisma.import.create({
        data: {
        id: importId,
        filename,
        file_hash: fileHash,
        status: ImportStatus.RUNNING,
        dataset: DatasetType.SERVICES,
        source: ImportSource.UPLOAD_CSV,
        mode: ImportMode.UPSERT,
        started_at: start,
        report_json: JSON.stringify({ issues: [] })

        }
    });

    try {
        const rawRecords = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true
        });

        const validData: any[] = [];
        
        for (const rawRow of rawRecords) {
            try {
                // Pre-process numbers
                const row = {
                    ...rawRow,
                    price: Number(rawRow.price) || 0,
                    duration: Number(rawRow.duration) || 0,
                    buffer_time: Number(rawRow.buffer_time) || 0,
                    transferable: rawRow.transferable === 'true' || rawRow.transferable === '1'
                };

                const result = ServiceSchema.safeParse(row);
                if (result.success) {
                    validData.push({ ...result.data, id: uuidv4() });
                } else {
                    console.warn(`Skipping invalid service row: ${JSON.stringify(row)}`, result.error);
                }
            } catch (e) {
                console.error("Error processing service row:", rawRow, e);
            }
        }

        const upsertPromises = validData.map(s => {
            return prisma.service.upsert({
                where: { service_name: s.service_name },
                update: {
                    category: s.category,
                    price: s.price,
                    duration: s.duration,
                    buffer_time: s.buffer_time,
                    executor_role: s.executor_role,
                    intensity_level: s.intensity_level,
                    transferable: s.transferable ?? false
                },
                create: {
                    id: s.id,
                    service_name: s.service_name,
                    category: s.category,
                    price: s.price,
                    duration: s.duration,
                    buffer_time: s.buffer_time,
                    executor_role: s.executor_role,
                    intensity_level: s.intensity_level,
                    transferable: s.transferable ?? false
                }
            });
        });

        await prisma.$transaction(upsertPromises);

        const end = new Date();
        const duration = end.getTime() - start.getTime();

        await prisma.import.update({
            where: { id: importId },
            data: {
                status: ImportStatus.COMPLETED,
                valid_count: validData.length,
                finished_at: end,
                duration_ms: duration,
                report_json: JSON.stringify({ message: "Service import completed" })
            }
        });

        return {
        importId,
        status: "completed",
        counts: {
            total: rawRecords.length,
            valid: validData.length,
            quarantine: 0
        }
        };
    } catch (error: any) {
        await prisma.import.update({
            where: { id: importId },
            data: {
                status: ImportStatus.FAILED,
                error_summary: error.message || "Unknown error",
                finished_at: new Date()
            }
        });
        throw error;
    }
  }

  static async ingestAppointments(fileBuffer: Buffer, filename: string, mode: 'replace' | 'append' = 'replace') {
    const importId = uuidv4();
    const start = new Date();
    const fileHash = this.calculateHash(fileBuffer);

    // Idempotency Check
    const queryMode = mode === 'append' ? ImportMode.APPEND : ImportMode.REPLACE;

    const existing = await prisma.import.findFirst({
        where: {
            dataset: DatasetType.APPOINTMENTS,
            mode: queryMode,
            file_hash: fileHash,
            status: ImportStatus.COMPLETED
        }
    });

    if (existing) {
    if (existing) {
        return {
            duplicated: true,
            existing_import_id: existing.id,
            message: `File content already imported as Job ${existing.id} (Mode: ${mode})`,
        };
    }
    }

    await prisma.import.create({
        data: {
        id: importId,
        filename,
        file_hash: fileHash,
        status: ImportStatus.RUNNING,
        dataset: DatasetType.APPOINTMENTS,
        source: ImportSource.UPLOAD_CSV,
        mode: queryMode,
        started_at: start,
        report_json: JSON.stringify({ issues: [] })

        }
    });

    try {
        const rawRecords = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true
        });

        const validData: any[] = [];
        const quarantineData: any[] = [];
        const issuesList: ValidationIssue[] = [];

        // Counters
        let validCount = 0;
        let quarantineCount = 0;
        let warningCount = 0;

        console.log(`[Ingest] Processing ${rawRecords.length} appointment records... Mode: ${mode}`);

        // Pre-fetch Reference Data
        const allStaff = await prisma.staff.findMany({ select: { staff_name: true } });
        const validStaffNames = new Set(allStaff.map(s => s.staff_name));
        
        const allServices = await prisma.service.findMany({ select: { service_name: true } });
        const validServiceNames = new Set(allServices.map(s => s.service_name));

        const seenIds = new Set<string>();

        // Process each row
        for (let i = 0; i < rawRecords.length; i++) {
        const row = rawRecords[i];
        const result = AppointmentRowSchema.safeParse(row);

        const rowIssues: any[] = [];
        let zodSuccess = result.success;

        // 1. Zod Issues (Warnings & Errors)
        if (!result.success) {
            result.error.issues.forEach(issue => {
                const severity = (issue as any).params?.severity || 'error';
                rowIssues.push({
                    severity,
                    code: issue.code,
                    message: issue.message,
                    path: issue.path
                });
                // Errors are counted in status logic later, warnings here if needed
                if (severity !== 'error') warningCount++;
            });
        }

        // 2. Referential Integrity (Strict Error)
        if (row.doctor_name && !validStaffNames.has(row.doctor_name)) {
            rowIssues.push({
                severity: 'error',
                code: 'INVALID_REF_DOCTOR',
                message: `Doctor '${row.doctor_name}' not found`,
                path: ['doctor_name']
            });
        }
        if (row.service_item && !validServiceNames.has(row.service_item)) {
            rowIssues.push({
                severity: 'error',
                code: 'INVALID_REF_SERVICE',
                message: `Service '${row.service_item}' not found`,
                path: ['service_item']
            });
        }

        // 3. Duplicate Check (Strict Error)
        const idKey = row.appointment_id ? row.appointment_id.toLowerCase() : '';
        
        if (idKey && seenIds.has(idKey)) {
            rowIssues.push({ 
                severity: 'error',
                code: "DUPLICATE_IN_FILE", 
                message: "Duplicate Appointment ID in uploaded file",
                path: ['appointment_id']
            });
        } else if (idKey) {
            seenIds.add(idKey);
        }

        // 4. Decision
        // Any error severity -> Quarantine
        const hasError = rowIssues.some(x => x.severity === 'error');

        if (hasError) {
            quarantineCount++;
            // Log first 3 quarantines for verification
            if (quarantineData.length < 3) {
                console.log(`[Ingest] Quarantine #${quarantineData.length + 1} AppointmentID: ${row.appointment_id}`);
                console.log(`         Reasons: ${JSON.stringify(rowIssues.map(i => `${i.code}: ${i.message}`))}`);
            }
            quarantineData.push({
                id: uuidv4(),
                import_id: importId,
                row_index: i,
                appointment_id: row.appointment_id || null,
                raw_data: JSON.stringify(row),
                issues_json: JSON.stringify(rowIssues)
            });
        } else {
                // Valid (Success or Warnings Only)
                // If Zod passed, use typed data. If Zod had warnings, use manual coercion on row.
                // Note: result.data is only available if result.success is true.
                
                let finalRow: any;
                if (zodSuccess) {
                    finalRow = result.data;
                } else {
                    // Coerce manually for warning-only valid rows
                    finalRow = {
                        ...row,
                        age: row.age ? Number(row.age) : null,
                        is_new: typeof row.is_new === 'string' ? (row.is_new.toLowerCase() === 'yes' || row.is_new.toLowerCase() === 'true') : !!row.is_new,
                    };
                }

                validData.push({ ...finalRow, import_id: importId, id: uuidv4() });
                validCount++;
        }
        }

        // Final Deduplication Safety (should be redundant now but keeping for append mode upstream check)
        const uniqueValidMap = new Map();
        validData.forEach(item => {
            // Use lowercase key to avoid DB collation collisions if any
            const key = item.appointment_id ? item.appointment_id.toLowerCase() : '';
            if (key && !uniqueValidMap.has(key)) {
                uniqueValidMap.set(key, item);
            } else {
                // Duplicate found (case-insensitive)
            }
        });
        const uniqueValidData = Array.from(uniqueValidMap.values());

        if (uniqueValidData.length !== validData.length) {
            console.warn(`[Ingest] WARNING: Found ${validData.length - uniqueValidData.length} duplicates in validData that skipped checks. Removing them.`);
        }

        // Duplicate check logic removed to support "Delete-then-Insert" strategy
        // We now allow overwriting existing appointments in Append mode via logic in the transaction below.

        const validAppointmentInputs = uniqueValidData.map(d => ({
            id: d.id,
            appointment_id: d.appointment_id,
            import_id: importId,
            date: d.date,
            time: d.time,
            age: d.age,
            gender: d.gender,
            is_new: d.is_new,
            status: d.status,
            customer_id: d.customer_id,
            doctor_name: d.doctor_name,
            staff_role: d.staff_role,
            service_item: d.service_item,
            purchased_services: d.purchased_services,
            room: d.room,
            equipment: d.equipment
        }));

        // Transaction
        const result = await prisma.$transaction(async (tx) => {
            let deletedAppointments = 0;
            let deletedQuarantine = 0;

            if (mode === 'replace') {
                const delApp = await tx.appointment.deleteMany({});
                const delQuar = await tx.quarantineAppointment.deleteMany({});
                deletedAppointments = delApp.count;
                deletedQuarantine = delQuar.count;
            }

            // Removed Import Creation from here, already done

            if (validAppointmentInputs.length > 0) {
                const BATCH_SIZE = 2000;
                for (let i = 0; i < validAppointmentInputs.length; i += BATCH_SIZE) {
                    const batch = validAppointmentInputs.slice(i, i + BATCH_SIZE);
                    
                    // Robustness: If APPEND mode, delete existing IDs in this batch first (Pseudo-Upsert)
                    // This prevents unique constraint violations on appointment_id
                    if (mode === 'append') {
                        const batchIds = batch.map(b => b.appointment_id);
                        const deletedInfo = await tx.appointment.deleteMany({
                            where: { appointment_id: { in: batchIds } }
                        });
                        deletedAppointments += deletedInfo.count;
                    }

                    await tx.appointment.createMany({ data: batch });
                }
            }
            
            if (quarantineData.length > 0) {
                await tx.quarantineAppointment.createMany({ data: quarantineData });
            }

            return {
                deletedAppointments,
                deletedQuarantine
            };
        }, {
            timeout: 60000 
        });

        const end = new Date();
        const duration = end.getTime() - start.getTime();

        await prisma.import.update({
            where: { id: importId },
            data: {
                status: ImportStatus.COMPLETED,
                valid_count: validCount,
                quarantine_count: quarantineData.length,
                warning_count: warningCount,
                report_json: JSON.stringify({ issues: issuesList }),
                finished_at: end,
                duration_ms: duration
            }
        });

        return {
            importId,
            mode,
            status: "completed",
            counts: {
                total: rawRecords.length,
                valid: validAppointmentInputs.length,
                quarantine: quarantineData.length
            },
            meta: {
                deletedBeforeInsert: {
                    appointments: result.deletedAppointments,
                    quarantine: result.deletedQuarantine
                }
            }
        };

    } catch (error: any) {
        await prisma.import.update({
            where: { id: importId },
            data: {
                status: ImportStatus.FAILED,
                error_summary: error.message || String(error),
                finished_at: new Date()
            }
        });
        throw error;
    }

  }
}
