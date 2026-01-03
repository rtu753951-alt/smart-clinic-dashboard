import { AppointmentRecord, StaffRecord, StaffWorkloadRecord } from "../../data/schema";
import { dataStore } from "../../data/dataStore";

const services = dataStore.services;


/**
 * 依照服務名稱取得執行角色（doctor / consultant / nurse / therapist）
 */
function getExecutorRole(serviceName: string): string | null {
  const service = services.find((s: { service_name: string; }) => s.service_name === serviceName);

  if (!service) {
    console.warn("⚠ 找不到服務名稱:", serviceName);
    return null;
  }

  if (!service.executor_role) {
    console.warn("⚠ 服務缺少 executor_role:", serviceName);
    return null;
  }

  return service.executor_role;
}

/**
 * 依照 appointments 自動累加醫師 / 諮詢師工作量
 */
function aggregateFromAppointments(appointments: AppointmentRecord[], staffList: StaffRecord[]) {
  const workload: Record<string, number> = {};

  for (const appt of appointments) {
    const service = services.find(s => s.service_name === appt.service_item);
    if (!service) continue;

    const role = (() => {
      switch (service.category) {
        case "consult": return "consultant";
        case "inject": return "nurse";
        case "laser": return "nurse";
        case "rf": return "therapist";
        case "facial": return "therapist";
        default: return null;
      }
    })();

    if (!role) continue;

    // 找出該角色的實際 staff_name
    const staff = staffList.find(s => s.staff_type === role);
    if (!staff) continue;

    const staffName = staff.staff_name;

    workload[staffName] = (workload[staffName] || 0) + 1;
  }

  return workload;
}


/**
 * 從 staff_workload.csv 加上護理師 & 美療師工作量
 */
export function aggregateFromCSV(
  staffWorkloadCSV: StaffWorkloadRecord[]
): Record<string, number> {
  const workload: Record<string, number> = {};

  for (const row of staffWorkloadCSV) {
    const name = row.staff_name;
    const count = Number(row.count || 0);

    if (!name) continue;

    workload[name] = (workload[name] || 0) + count;
  }

  return workload;
}

/**
 * 合併兩邊來源 → 最終人力負載表
 */
export function aggregateStaffWorkload(
  appointments: AppointmentRecord[],
  staffWorkloadCSV: StaffWorkloadRecord[]
): Record<string, number> {
  const fromAppt = aggregateFromAppointments(appointments, dataStore.staff);
  const fromCSV = aggregateFromCSV(staffWorkloadCSV);

  const result: Record<string, number> = {};

  const allNames = new Set([
    ...Object.keys(fromAppt),
    ...Object.keys(fromCSV)
  ]);

  for (const name of allNames) {
    result[name] = (fromAppt[name] || 0) + (fromCSV[name] || 0);
  }

  return result;
}
