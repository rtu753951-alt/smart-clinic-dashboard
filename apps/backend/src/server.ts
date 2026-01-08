import express from "express";
import cors from "cors";
import systemRoutes from "./routes/system";
import ingestRoutes from "./routes/ingest";
// import appointmentRoutes from "./routes/appointments";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/system", systemRoutes);
app.use("/api/ingest", ingestRoutes);
// app.use("/api/appointments", appointmentRoutes);

app.listen(PORT, () => {
  console.log(`Smart Clinic Backend running on port ${PORT}`);
  console.log(`DB URL: ${process.env.DATABASE_URL}`);
});
