import { PrismaClient } from "@prisma/client";
import { IngestService } from "../src/services/ingestService";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Import Flow Verification...");

  // Mock CSV Data
  const staffCsv = `staff_name,staff_type,status\nDr. Test,Doctor,active\nNurse Test,Nurse,active`;

  // 1. Test Staff Import
  console.log("\n1. Testing Staff Import...");
  try {
      const result = await IngestService.ingestStaff(Buffer.from(staffCsv), "test_staff.csv");
      console.log("Result:", result);

      const job = await prisma.import.findUnique({ where: { id: result.importId } });
      console.log("Job Record Status:", job?.status);
      console.log("Job Record Dataset:", job?.dataset);
      console.log("Job Record Duration:", job?.duration_ms);

      if (job?.status !== "completed" || job.dataset !== "staff" || typeof job.duration_ms !== 'number') {
          throw new Error("Staff Job verification failed!");
      }
      console.log("MATCH: Staff Import Job verified.");
  } catch (e) {
      console.error("Staff Import Failed:", e);
  }

  // 2. Test Services Import
    const serviceCsv = `service_name,price,duration,transferable\nTest Service,100,30,true`;
    console.log("\n2. Testing Services Import...");
    try {
        const result = await IngestService.ingestServices(Buffer.from(serviceCsv), "test_service.csv");
        const job = await prisma.import.findUnique({ where: { id: result.importId } });
        console.log("Job Record Status:", job?.status);
        console.log("Job Record Dataset:", job?.dataset);
        
        if (job?.status !== "completed" || job.dataset !== "services") {
            throw new Error("Services Job verification failed!");
        }
        console.log("MATCH: Service Import Job verified.");
    } catch(e) { console.error(e); }

  // 3. Test Appointment Import (Replace)
  const apptCsv = `appointment_id,date,time,status,doctor_name,service_item\nA999,2025-01-01,10:00,Scheduled,Dr. Test,Test Service`;

  console.log("\n3. Testing Appointment Import...");
   try {
        const result = await IngestService.ingestAppointments(Buffer.from(apptCsv), "test_appt.csv", "replace");
        const job = await prisma.import.findUnique({ where: { id: result.importId } });
        console.log("Job Record Status:", job?.status);
        console.log("Job Record Dataset:", job?.dataset);
        console.log("Job Record Mode:", job?.mode);

         if (job?.status !== "completed" || job.dataset !== "appointments" || job.mode !== "replace") {
            throw new Error("Appointment Job verification failed!");
        }
        console.log("MATCH: Appointment Import Job verified.");
   } catch(e) { console.error(e); }

   console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
