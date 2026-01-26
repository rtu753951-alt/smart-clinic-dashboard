import { StaffType } from "./schema";

export const ROLE_DISPLAY_NAMES: Record<StaffType, string> = {
    doctor: "醫師",
    nurse: "護理師",
    therapist: "美療師",
    consultant: "諮詢師",
    admin: "行政人員"
};

export function getRoleDisplayName(role: StaffType | string): string {
    return ROLE_DISPLAY_NAMES[role as StaffType] || role;
}
