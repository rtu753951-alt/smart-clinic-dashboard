import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient(); // In real app, share instance

router.get("/health", async (req, res) => {
  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (e) {
    dbStatus = "disconnected";
  }

  res.json({
    status: "ok",
    version: "0.1.0",
    db: {
      type: "sqlite",
      connected: dbStatus === "connected"
    },
    time: new Date().toISOString()
  });
});

export default router;
