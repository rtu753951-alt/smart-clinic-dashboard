
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== DB Verification ===");
  
  // 1. Check for stuck running jobs
  const stuckJobs = await prisma.import.findMany({
    where: { 
        status: 'running',
        started_at: { lt: new Date(Date.now() - 10 * 60 * 1000) } 
    },
    select: { id: true, status: true, started_at: true }
  });
  console.log(`Stuck Running Jobs (< 10 mins ago): ${stuckJobs.length}`);
  if (stuckJobs.length > 0) console.table(stuckJobs);

  // 2. Check Append Mode Imports
  const appendImports = await prisma.import.findMany({
    where: { mode: 'append' },
    orderBy: { started_at: 'desc' },
    take: 5,
    select: { id: true, mode: true, valid_count: true, started_at: true }
  });
  console.log(`\nLatest Append Imports:`);
  console.table(appendImports);

  // 3. Count Appointments
  const count = await prisma.appointment.count();
  console.log(`\nTotal Appointments: ${count}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
