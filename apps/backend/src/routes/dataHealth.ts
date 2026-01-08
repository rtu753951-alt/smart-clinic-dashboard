import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

router.get("/health", async (req, res) => {
  try {
    const importId = req.query.importId as string;
    
    // Find latest import if not specified
    const importRecord = await prisma.import.findFirst({
        where: importId ? { id: importId } : {},
        orderBy: { imported_at: 'desc' }
    });

    if (!importRecord) {
        return res.json({ state: 'unknown', summary: { total: 0 } });
    }

    // Determine state logic (similar to frontend SystemHealthEvaluator)
    // Simply return stored counts
    const total = importRecord.valid_count + importRecord.quarantine_count;
    const passedRatio = total > 0 ? importRecord.valid_count / total : 0;
    
    let state = 'normal';
    if (passedRatio < 0.85) state = 'critical';
    else if (passedRatio < 0.95) state = 'warning';

    res.json({
      state,
      passedRatio,
      lastCheckedAt: importRecord.imported_at,
      summary: {
        total,
        valid: importRecord.valid_count,
        quarantine: importRecord.quarantine_count,
        warnings: importRecord.warning_count
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
