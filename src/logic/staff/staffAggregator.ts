import type { AppointmentRecord } from "../../data/schema.js";

export function aggregateStaffLoad(appointments: AppointmentRecord[]) {
  const timeBuckets = ["12-14", "14-16", "16-18", "18-21"];

  const roles = ["doctor", "nurse", "therapist", "consultant"];
  const result: Record<string, Record<string, number>> = {};

  // ?��???
  roles.forEach(r => {
    result[r] = {};
    timeBuckets.forEach(t => result[r][t] = 0);
  });

  appointments.forEach(a => {
    // ?�段計�?
    const hour = Number(a.time.slice(0, 2));
    let bucket = "18-21";

       if (hour < 14) bucket = "12-14";
       else if (hour < 16) bucket = "14-16";
       else if (hour < 18) bucket = "16-18";


    let role = "";

    // 1️⃣ assistant_role ?�為?��??��??�接使用
    const staffRoleLower = a.assistant_role?.toLowerCase();
    if (["doctor", "nurse", "therapist", "consultant"].includes(staffRoleLower)) {
      role = staffRoleLower;
    }
    // ?�� ?��? therapist ???��???therapist
    else if (staffRoleLower === "therapist") {
      role = "therapist";
    }

    // 2️⃣ doctor_name ?�含?�醫師」�? 視為 doctor
    else if (a.doctor_name && a.doctor_name.includes("?�師")) {
      role = "doctor";
    }

    // 3️⃣ service_item ?�起來�?美容類�?簡單?��?�?
    else if (["Hydra Facial", "Mesotherapy", "Skin Booster"].includes(a.service_item)) {
      role = "therapist";
    }

    // 4️⃣ ?��??��??�知 ??忽略
    if (!role) return;

    result[role][bucket]++;
  });

  return result;
}
