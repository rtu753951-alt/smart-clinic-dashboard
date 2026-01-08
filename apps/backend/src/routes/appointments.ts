import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || "1");
    const pageSize = parseInt(req.query.pageSize as string || "50");
    const status = req.query.status as string;
    const start_date = req.query.start_date as string;
    const end_date = req.query.end_date as string;
    const doctor_name = req.query.doctor_name as string;
    const service_item = req.query.service_item as string;

    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (start_date || end_date) {
      where.date = {};
      if (start_date) where.date.gte = start_date;
      if (end_date) where.date.lte = end_date;
    }

    if (doctor_name) {
      where.doctor_name = { contains: doctor_name };
    }

    if (service_item) {
      where.service_item = { contains: service_item };
    }

    const [total, items] = await prisma.$transaction([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { date: 'desc' }
      })
    ]);

    res.json({
      page,
      pageSize,
      total,
      items
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
