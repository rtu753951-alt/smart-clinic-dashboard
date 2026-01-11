import { PrismaClient } from "@prisma/client";
import { IngestService } from "../src/services/ingestService";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting File Hash Idempotency Verification...");

  const content = `staff_name,staff_type,status\nDups Dr. ${uuidv4().substring(0,8)},Doctor,active`;
  const filename = "test_dups.csv";

  // 1. First Import (Should Success)
  console.log("\n1. First Import (Expect Success)...");
  try {
      const result1 = await IngestService.ingestStaff(Buffer.from(content), filename);
      console.log("First Import ID:", result1.importId);
      
      const job1 = await prisma.import.findUnique({ where: { id: result1.importId } });
      if (!job1?.file_hash) throw new Error("File Hash NOT populated!");
      console.log("Hash:", job1.file_hash);

  } catch (e) {
      console.error("First Import Failed:", e);
      process.exit(1);
  }

  // 2. Second Import (Should Fail / Throw)
  console.log("\n2. Second Import (Expect Failure/Duplicate)...");
  try {
      await IngestService.ingestStaff(Buffer.from(content), filename);
      console.error("ERROR: Second import succeeded but should have failed!");
      process.exit(1);
  } catch (e: any) {
      if (e.code === "DUPLICATE_IMPORT") {
          console.log("SUCCESS: Caught expected DUPLICATE_IMPORT error.");
          console.log("Message:", e.message);
          console.log("Original Import ID:", e.importId);
      } else {
          console.error("ERROR: Caught unexpected error:", e);
          process.exit(1);
      }
  }

  // 3. Modified Import (Should Success)
  console.log("\n3. Modified Import (Expect Success)...");
  const newContent = content + "\n"; // Just add a newline to change hash
  try {
      const result3 = await IngestService.ingestStaff(Buffer.from(newContent), filename);
      console.log("Modified Import ID:", result3.importId);
      console.log("SUCCESS: Modified content imported successfully.");
  } catch (e) {
      console.error("Modified Import Failed:", e);
      process.exit(1);
  }

  console.log("\nVerification Complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
