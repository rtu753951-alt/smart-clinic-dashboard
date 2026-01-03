import type { AppointmentRecord } from "../../data/schema.js";

export function aggregateStaffLoad(appointments: AppointmentRecord[]) {
  const timeBuckets = ["12-14", "14-16", "16-18", "18-21"];

  const roles = ["doctor", "nurse", "therapist", "consultant"];
  const result: Record<string, Record<string, number>> = {};

  // ?å???
  roles.forEach(r => {
    result[r] = {};
    timeBuckets.forEach(t => result[r][t] = 0);
  });

  appointments.forEach(a => {
    // ?‚æ®µè¨ˆç?
    const hour = Number(a.time.slice(0, 2));
    let bucket = "18-21";

       if (hour < 14) bucket = "12-14";
       else if (hour < 16) bucket = "14-16";
       else if (hour < 18) bucket = "16-18";


    let role = "";

    // 1ï¸âƒ£ staff_role ?¥ç‚º?ˆæ??¼ï??´æŽ¥ä½¿ç”¨
    const staffRoleLower = a.staff_role?.toLowerCase();
    if (["doctor", "nurse", "therapist", "consultant"].includes(staffRoleLower)) {
      role = staffRoleLower;
    }
    // ?”¥ ?•ç? therapist ??? å???therapist
    else if (staffRoleLower === "therapist") {
      role = "therapist";
    }

    // 2ï¸âƒ£ doctor_name ?…å«?Œé†«å¸«ã€â? è¦–ç‚º doctor
    else if (a.doctor_name && a.doctor_name.includes("?«å¸«")) {
      role = "doctor";
    }

    // 3ï¸âƒ£ service_item ?‹èµ·ä¾†å?ç¾Žå®¹é¡žï?ç°¡å–®?¤å?ï¼?
    else if (["Hydra Facial", "Mesotherapy", "Skin Booster"].includes(a.service_item)) {
      role = "therapist";
    }

    // 4ï¸âƒ£ ?¥è??²ä??ªçŸ¥ ??å¿½ç•¥
    if (!role) return;

    result[role][bucket]++;
  });

  return result;
}
