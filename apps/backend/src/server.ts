import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import systemRoutes from "./routes/system";
import ingestRoutes from "./routes/ingest";
// import appointmentRoutes from "./routes/appointments";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true
}));
app.use(express.json());

// Routes
app.use("/api/system", systemRoutes);
app.use("/api/ingest", ingestRoutes);
// app.use("/api/appointments", appointmentRoutes);

// Health Checks
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const count = await prisma.appointment.count();
    const lastImport = await prisma.import.findFirst({ orderBy: { started_at: 'desc' }, select: { id: true, status: true } });
    res.json({ 
      ok: true, 
      appointmentCount: count, 
      latestImportId: lastImport?.id,
      latestImportStatus: lastImport?.status
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Smart Clinic Backend running on port ${PORT}`);
  console.log(`DB URL: ${process.env.DATABASE_URL}`);
});
