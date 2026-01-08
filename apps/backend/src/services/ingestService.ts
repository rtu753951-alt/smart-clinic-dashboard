import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { 
  AppointmentRowSchema, 
  StaffSchema, 
  ServiceSchema,
  ValidationReport,
  ValidationIssue
} from "@clinic/shared";

const prisma = new PrismaClient();

export class IngestService {
  

  static async ingestStaff(fileBuffer: Buffer, filename: string) {
    const importId = uuidv4();
    const rawRecords = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const validData: any[] = [];
    const validCount = rawRecords.length; // Staff/Service usually rigid, assume all valid or strictly skipped
    
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
    // Since Staff name is unique, we upsert based on it.
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

    await prisma.$transaction([
       prisma.import.create({
         data: {
           id: importId,
           filename,
           status: "completed",
           valid_count: validData.length,
           quarantine_count: 0, // No quarantine logic for staff yet
           warning_count: 0,
           report_json: JSON.stringify({ message: "Staff import completed" })
         }
       }),
       ...upsertPromises
    ]);

    return {
      importId,
      status: "completed",
      counts: {
        total: rawRecords.length,
        valid: validData.length,
        quarantine: 0
      }
    };
  }

  static async ingestServices(fileBuffer: Buffer, filename: string) {
    const importId = uuidv4();
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

    await prisma.$transaction([
       prisma.import.create({
         data: {
           id: importId,
           filename,
           status: "completed",
           valid_count: validData.length,
           quarantine_count: 0,
           warning_count: 0,
           report_json: JSON.stringify({ message: "Service import completed" })
         }
       }),
       ...upsertPromises
    ]);

    return {
      importId,
      status: "completed",
      counts: {
        total: rawRecords.length,
        valid: validData.length,
        quarantine: 0
      }
    };
  }

  static async ingestAppointments(fileBuffer: Buffer, filename: string, mode: 'replace' | 'append' = 'replace') {
    const importId = uuidv4();
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

    // Check for duplicates if APPEND mode
    if (mode === 'append' && uniqueValidData.length > 0) {
        const incomingIds = uniqueValidData.map(d => d.appointment_id);
        
        // Check database for existing IDs
        const existing = await prisma.appointment.findMany({
            where: {
                appointment_id: { in: incomingIds }
            },
            select: { appointment_id: true }
        });

        if (existing.length > 0) {
            const duplicateIds = existing.map(e => e.appointment_id);
            throw {
                code: "DUPLICATE_APPOINTMENT_ID",
                duplicateCount: existing.length,
                duplicateIds: duplicateIds.slice(0, 20),
                hint: "Use mode=replace or upsert"
            };
        }
    }

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
    return await prisma.$transaction(async (tx) => {
        let deletedAppointments = 0;
        let deletedQuarantine = 0;

        if (mode === 'replace') {
            const delApp = await tx.appointment.deleteMany({});
            const delQuar = await tx.quarantineAppointment.deleteMany({});
            deletedAppointments = delApp.count;
            deletedQuarantine = delQuar.count;
        }

        await tx.import.create({
            data: {
            id: importId,
            filename,
            status: "completed",
            valid_count: validCount,
            quarantine_count: quarantineData.length,
            warning_count: warningCount,
            report_json: JSON.stringify({ issues: issuesList })
            }
        });

        if (validAppointmentInputs.length > 0) {
            const BATCH_SIZE = 2000;
            for (let i = 0; i < validAppointmentInputs.length; i += BATCH_SIZE) {
                const batch = validAppointmentInputs.slice(i, i + BATCH_SIZE);
                await tx.appointment.createMany({ data: batch });
            }
        }
        
        if (quarantineData.length > 0) {
            await tx.quarantineAppointment.createMany({ data: quarantineData });
        }

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
                    appointments: deletedAppointments,
                    quarantine: deletedQuarantine
                }
            }
        };
    }, {
        timeout: 60000 
    });
  }
}
