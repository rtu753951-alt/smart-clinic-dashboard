import type { AppointmentRecord } from "../../data/schema.js";

export function aggregateStaffLoad(appointments: AppointmentRecord[]) {
  const timeBuckets = ["12-14", "14-16", "16-18", "18-21"];

  const roles = ["doctor", "nurse", "therapist", "consultant"];
  const result: Record<string, Record<string, number>> = {};

  // 初始化
  roles.forEach(r => {
    result[r] = {};
    timeBuckets.forEach(t => result[r][t] = 0);
  });

  appointments.forEach(a => {
    // 時段計算
    const hour = Number(a.time.slice(0, 2));
    let bucket = "18-21";

       if (hour < 14) bucket = "12-14";
       else if (hour < 16) bucket = "14-16";
       else if (hour < 18) bucket = "16-18";


    let role = "";

    // 1️⃣ assistant_role 欄位直接使用
    const staffRoleLower = (a.assistant_role ?? "").toLowerCase();
    if (["doctor", "nurse", "therapist", "consultant"].includes(staffRoleLower)) {
      role = staffRoleLower;
    }
    // 舊版相容 therapist
    else if (staffRoleLower === "therapist") {
      role = "therapist";
    }

    // 2️⃣ doctor_name 包含「醫師」者 視為 doctor
    else if (a.doctor_name && a.doctor_name.includes("醫師")) {
      role = "doctor";
    }

    // 3️⃣ service_item 看起來像美容類的簡單判斷
    else if (["Hydra Facial", "Mesotherapy", "Skin Booster"].includes(a.service_item)) {
      role = "therapist";
    }

    // 4️⃣ 找不到角色 則忽略
    if (!role) return;

    result[role][bucket]++;
  });

  return result;
}
