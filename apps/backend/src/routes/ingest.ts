import { Router } from "express";
import multer from "multer";
import { IngestService } from "../services/ingestService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/appointments", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    const mode = (req.query.mode as string) === 'append' ? 'append' : 'replace';

    const result = await IngestService.ingestAppointments(req.file.buffer, req.file.originalname, mode);
    res.json(result);
  } catch (err: any) {
    if (err.code === "DUPLICATE_APPOINTMENT_ID") {
        return res.status(409).json({
            error: "Duplicate Appointment ID",
            ...err
        });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/staff", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const result = await IngestService.ingestStaff(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/services", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const result = await IngestService.ingestServices(req.file.buffer, req.file.originalname);
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
