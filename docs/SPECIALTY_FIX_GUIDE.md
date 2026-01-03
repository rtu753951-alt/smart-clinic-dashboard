# 療程風險分析 - Specialty 判斷修正指南

## 問題說明

目前療程風險分析出現「無可執行人力」誤判，原因是只檢查了 `executor_role`，沒有檢查 `specialty`。

## 解決方案

需要在 `src/ai/riskAlertEngine.ts` 的 `analyzeServiceRisks` 函數中添加 specialty 判斷。

## Category → Specialty 對照表

```typescript
const CATEGORY_TO_SPECIALTY: Record<string, string[]> = {
  laser: ["皮秒", "雷射", "美療"],
  rf: ["電波", "音波", "美容醫學"],
  inject: ["美容醫學", "皮膚科"],
  consult: ["諮詢分析"],
  drip: ["護理"],
};
```

## 修正步驟

### 步驟 1：添加對照表

在 `analyzeServiceRisks` 函數前添加：

```typescript
/**
 * Category → Specialty 對照表
 */
const CATEGORY_TO_SPECIALTY: Record<string, string[]> = {
  laser: ["皮秒", "雷射", "美療"],
  rf: ["電波", "音波", "美容醫學"],
  inject: ["美容醫學", "皮膚科"],
  consult: ["諮詢分析"],
  drip: ["護理"],
};

/**
 * 檢查 staff 是否能執行特定 category 的療程
 */
function canExecuteCategory(staffSpecialty: string, category: string): boolean {
  const allowedSpecialties = CATEGORY_TO_SPECIALTY[category];
  if (!allowedSpecialties) {
    return true; // 保守判斷
  }
  return allowedSpecialties.some((specialty) =>
    staffSpecialty.includes(specialty)
  );
}
```

### 步驟 2：更新可執行人力計算

找到這段程式碼：

```typescript
// 舊版（只檢查 role 和 status）
const availableStaff = staff.filter(
  (s) => s.staff_type === executorRole && (s as any).status === "active"
);
```

替換為：

```typescript
// 新版（檢查 role、status 和 specialty）
const availableStaff = staff.filter((s) => {
  // 1. executor_role 相符
  if (s.staff_type !== executorRole) return false;

  // 2. status === "active"
  if ((s as any).status !== "active") return false;

  // 3. specialty 屬於該 category 對應的 specialty 清單
  const staffSpecialty = (s as any).specialty || "";
  if (!canExecuteCategory(staffSpecialty, category)) return false;

  return true;
});
```

### 步驟 3：更新 Debug 訊息

在 `console.log` 中添加 `staffDetails`：

```typescript
console.log(`  ${serviceName}:`, {
  count: appointmentCount,
  category, // 添加這行
  executorRole,
  availableStaff: availableStaffCount,
  staffDetails: availableStaff.map((s) => ({
    // 添加這個
    name: s.staff_name,
    specialty: (s as any).specialty,
  })),
  demandHours: Math.round(demandHours * 10) / 10,
  supplyHours,
  loadRate:
    supplyHours > 0
      ? `${Math.round((demandHours / supplyHours) * 100)}%`
      : "N/A",
});
```

### 步驟 4：更新錯誤訊息

當 `availableStaffCount === 0` 時，更新錯誤訊息：

```typescript
alerts.push({
  type: "service",
  level: "critical",
  icon: "🔴",
  summary: `${serviceName} 無可執行人力`,
  detail: `${serviceName} 本月有 ${appointmentCount} 筆預約，但無符合資格的執行人員（需要：${executorRole} + ${category} 相關專長）`,
  reason: `本月預約：${appointmentCount} 筆｜需求工時：${Math.round(
    demandHours
  )} 小時｜可執行人數：0 人（需要 ${executorRole} 且具備 ${CATEGORY_TO_SPECIALTY[
    category
  ]?.join("/")} 專長）`,
  suggestion: "建議立即招募或培訓相關人員，或暫停該療程預約",
  metadata: { appointmentCount, demandHours, supplyHours: 0, loadRate: null },
});
```

## 測試方式

1. 編譯：`npm run build`
2. 重新整理瀏覽器
3. 查看 Console 中的「💉 療程風險分析」
4. 確認 `staffDetails` 顯示正確的人員和專長
5. 確認「無可執行人力」只在真正沒有符合資格的人員時出現

## 預期結果

**修正前：**

```
Pico Laser: {
  availableStaff: 0  // 誤判
}
```

**修正後：**

```
Pico Laser: {
  category: "laser",
  availableStaff: 2,
  staffDetails: [
    { name: "王美療師", specialty: "皮秒" },
    { name: "林美療師", specialty: "美療" }
  ]
}
```

## 注意事項

1. **specialty 匹配使用 `includes`**：允許部分匹配（例如「皮秒雷射」包含「皮秒」）
2. **保守判斷**：如果 category 不在對照表中，預設為可執行
3. **三重檢查**：必須同時符合 role、status 和 specialty

## 檔案狀態

由於檔案編輯過程中出現重複程式碼，建議：

1. 備份當前檔案
2. 從 Git 恢復乾淨版本
3. 手動應用上述修改

或者直接使用文字編輯器：

1. 打開 `src/ai/riskAlertEngine.ts`
2. 找到 `analyzeServiceRisks` 函數
3. 按照上述步驟修改
4. 刪除任何重複的程式碼
5. 確保檔案結構正確
