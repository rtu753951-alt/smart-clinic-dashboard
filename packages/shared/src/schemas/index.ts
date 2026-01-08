import { z } from "zod";

// Helper Regex
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;

// --- Service Schema ---
export const ServiceSchema = z.object({
  service_name: z.string().min(1, "Service name is required"),
  category: z.string().optional(), // Allow missing category
  price: z.union([z.number(), z.string()]).transform(val => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }),
  duration: z.union([z.number(), z.string()]).transform(val => {
    const num = Number(val);
    return isNaN(num) ? 0 : Math.abs(num); // Ensure positive
  }),
  buffer_time: z.union([z.number(), z.string()]).transform(val => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }),
  executor_role: z.string().optional(),
  intensity_level: z.string().optional(),
  transferable: z.union([z.boolean(), z.string(), z.number()]).transform(val => {
    if (typeof val === 'boolean') return val;
    const s = String(val).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }).optional()
});

// --- Staff Schema ---
export const StaffSchema = z.object({
  staff_name: z.string().min(1, "Staff name is required"),
  staff_type: z.enum(["doctor", "nurse", "therapist", "consultant", "admin", "other"]).or(z.string()),
  status: z.string().optional(),
  certified_services: z.string().optional()
});

// --- Appointment Schema (Row Level) ---
export const AppointmentRowSchema = z.object({
  appointment_id: z.string().min(1),
  date: z.string().regex(DATE_REGEX, "Invalid date format (YYYY-MM-DD)"),
  time: z.string().regex(TIME_REGEX, "Invalid time format (HH:mm)"),
  age: z.coerce.number().min(0).max(120).optional(),
  gender: z.enum(["male", "female", "other"]).or(z.string()).optional(),
  is_new: z.union([z.boolean(), z.string()]).transform(val => {
    if (typeof val === 'boolean') return val;
    return val?.toLowerCase() === 'yes' || val?.toLowerCase() === 'true';
  }),
  status: z.string().toLowerCase(),
  purchased_services: z.string().optional(),
  service_item: z.string().optional(),
  doctor_name: z.string().optional(),
  staff_role: z.string().optional(),
  room: z.string().optional(),
  equipment: z.string().optional(),
  customer_id: z.string().optional()
}).superRefine((data, ctx) => {
  const hasPurchased = !!data.purchased_services && data.purchased_services.trim() !== "";
  const hasItem = !!data.service_item && data.service_item.trim() !== "";
  
  const isCompletedOrPaid = ["completed", "paid", "checked_in"].includes(data.status);

  if (isCompletedOrPaid && !hasPurchased && !hasItem) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Completed/Paid appointment must have a service item or purchased service.",
      path: ["service_item"],
      params: { severity: "error" } 
    });
  }

  if (hasItem && hasPurchased) {
    if (!data.purchased_services!.includes(data.service_item!)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Service item '${data.service_item}' not found in purchased list '${data.purchased_services}'`,
        path: ["service_item"],
        params: { severity: "warning" }
      });
    }
  }
});
