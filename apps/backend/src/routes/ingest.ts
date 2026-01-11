import { Router } from "express";
import multer from "multer";
import { IngestService } from "../services/ingestService";

const router = Router();
// 設定 Multer 存入記憶體
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Simple In-Memory Rate Limit (No new deps)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 min
const MAX_REQUESTS = 30; // 30 req / min
const requestCounts = new Map<string, { count: number, resetAt: number }>();

const rateLimiter = (req: any, res: any, next: any) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({ 
      ok: false, 
      code: "RATE_LIMIT_EXCEEDED", 
      message: "Too many requests, please try again later." 
    });
  }

  record.count++;
  next();
};

router.use(rateLimiter);

router.post("/appointments", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, code: "MISSING_FILE", message: "Missing file" });
    }

    // mode 從 query 來（replace/append），預設 replace
    const mode = (req.query.mode === "append") ? "append" : "replace";

    const result = await IngestService.ingestAppointments(
      req.file.buffer,
      req.file.originalname,
      mode
    );

    if ('duplicated' in result && (result as any).duplicated) {
      const dup = result as any;
      return res.status(409).json({
        ok: false,
        code: "DUPLICATE_IMPORT",
        message: dup.message,
        details: { importId: dup.existing_import_id }
      });
    }

    return res.json({ ok: true, ...result });
  } catch (err: any) {
    // 統一錯誤格式
    return res.status(500).json({ 
      ok: false, 
      code: "INTERNAL_ERROR",
      message: err?.message ?? "Internal error" 
    });
  }
});

router.post("/staff", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, code: "MISSING_FILE", message: "No file uploaded" });
    }
    const result = await IngestService.ingestStaff(req.file.buffer, req.file.originalname);
    
    if ('duplicated' in result && (result as any).duplicated) {
        const dup = result as any;
        return res.status(409).json({
          ok: false,
          code: "DUPLICATE_IMPORT",
          message: dup.message,
          details: { importId: dup.existing_import_id }
        });
    }

    res.json({ ok: true, ...result });
  } catch (err: any) {
    if (err.code === "DUPLICATE_IMPORT") {
        return res.status(409).json({
            ok: false,
            code: "DUPLICATE_IMPORT",
            message: err.message,
            details: { importId: err.importId }
        });
    }
    console.error(err);
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: err.message });
  }
});

router.post("/services", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, code: "MISSING_FILE", message: "No file uploaded" });
    }
    const result = await IngestService.ingestServices(req.file.buffer, req.file.originalname);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    if (err.code === "DUPLICATE_IMPORT") {
        return res.status(409).json({
            ok: false,
            code: "DUPLICATE_IMPORT",
            message: err.message,
            details: { importId: err.importId }
        });
    }
    console.error(err);
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: err.message });
  }
});

// Error handling for Multer
router.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, code: "FILE_TOO_LARGE", message: "File too large (Max 10MB)" });
    }
  }
  next(err);
});

export default router;
