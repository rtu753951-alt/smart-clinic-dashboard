/**
 * 角色標準化工具
 * 
 * 用於確保所有角色名稱符合標準：doctor | nurse | therapist | consultant
 */

import { StaffRole } from "./schema";

/**
 * 標準角色列表
 */
export const STANDARD_ROLES: readonly StaffRole[] = ["doctor", "nurse", "therapist", "consultant"] as const;

/**
 * 驗證角色是否為標準角色
 */
export function isValidRole(role: string): role is StaffRole {
  return STANDARD_ROLES.includes(role as StaffRole);
}

/**
 * 標準化角色名稱
 * 
 * @param rawRole 原始角色名稱
 * @param fallback 當角色無效時的預設值（預設為 therapist）
 * @returns 標準化後的角色
 */
export function normalizeRole(rawRole: string, fallback: StaffRole = "therapist"): StaffRole {
  const trimmed = rawRole.trim();
  
  // beauty_therapist → therapist
  if (trimmed === "beauty_therapist") {
    return "therapist";
  }
  
  // 驗證是否為標準角色（直接比對，不轉小寫）
  if (isValidRole(trimmed)) {
    return trimmed;
  }
  
  // 非標準角色，顯示警告並返回預設值
  console.warn(`⚠️ 發現非標準角色: "${rawRole}"，已轉換為 "${fallback}"`);
  return fallback;
}

/**
 * 角色中文顯示名稱對照表（僅用於 UI 顯示層）
 */
export const ROLE_DISPLAY_NAMES: Record<StaffRole, string> = {
  doctor: "醫師",
  nurse: "護理師",
  therapist: "美療師",
  consultant: "諮詢師",
};

/**
 * 取得角色的中文顯示名稱
 */
export function getRoleDisplayName(role: StaffRole): string {
  return ROLE_DISPLAY_NAMES[role] || role;
}
