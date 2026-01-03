# 角色命名一致性重構 - 完成報告

## ✅ 重構目標

將系統中所有人力角色統一為四種標準名稱：

- `doctor` (醫師)
- `nurse` (護理師)
- `therapist` (美療師)
- `consultant` (諮詢師)

移除 `beauty_therapist`，統一使用 `therapist` 作為內部標準名稱。

## ✅ 已完成的工作

### 1. 型別定義標準化

**檔案：`src/data/schema.ts`**

- ✅ 更新 `StaffType` 定義，移除 `beauty_therapist`
- ✅ 新增 `StaffRole` 別名型別
- ✅ 更新 `ServiceInfo.executor_role` 使用 `StaffRole`

```typescript
export type StaffType = "doctor" | "nurse" | "therapist" | "consultant";
export type StaffRole = StaffType;
```

### 2. 建立角色標準化工具

**檔案：`src/data/roleUtils.ts` (新建)**

- ✅ `normalizeRole()` - 自動轉換 `beauty_therapist` → `therapist`
- ✅ `isValidRole()` - 驗證角色是否為標準角色
- ✅ `getRoleDisplayName()` - 取得角色的中文顯示名稱
- ✅ `ROLE_DISPLAY_NAMES` - 中文名稱對照表（僅用於 UI 顯示）

```typescript
export function normalizeRole(
  rawRole: string,
  fallback: StaffRole = "therapist"
): StaffRole {
  // beauty_therapist → therapist
  // 非標準角色 → 顯示警告並返回預設值
}
```

### 3. 資料清洗邏輯更新

**檔案：`src/data/dataStore.ts`**

- ✅ 導入 `normalizeRole` 函數
- ✅ 更新 `services.csv` 清洗邏輯
- ✅ 自動轉換 `executor_role` 中的 `beauty_therapist`

```typescript
const executor_role = normalizeRole(rawRole, "therapist");
```

### 4. KPI 引擎更新

**檔案：`src/logic/kpiEngine.ts`**

- ✅ 移除 `beauty_therapist` 的比較條件
- ✅ 只使用標準角色 `therapist` 和 `consultant`

### 5. 人員工作負載模組更新

**檔案：`src/logic/staff/staffWorkloadBars.ts`**

- ✅ 更新 `ROLE_ICONS` 使用 `therapist`
- ✅ 更新 `ROLE_NAMES` 使用 `therapist`（顯示「美療師」）
- ✅ 更新 `STAFF_COUNTS` 使用 `therapist`
- ✅ 更新護理師協助工時邏輯
- ✅ 修正所有註解中的編碼問題

**檔案：`src/logic/staff/staffAggregator.ts`**

- ✅ 替換所有 `beauty_therapist` 為 `therapist`

## 📊 標準角色對照表

| 內部名稱     | 中文顯示 | 圖標           | 說明           |
| ------------ | -------- | -------------- | -------------- |
| `doctor`     | 醫師     | fa-user-doctor | 執行醫療行為   |
| `nurse`      | 護理師   | fa-user-nurse  | 協助醫療與療程 |
| `therapist`  | 美療師   | fa-spa         | 執行美容療程   |
| `consultant` | 諮詢師   | fa-user-tie    | 客戶諮詢服務   |

## 🔧 自動轉換規則

### CSV 資料載入時

**`services.csv` 的 `executor_role` 欄位：**

- `beauty_therapist` → 自動轉換為 `therapist`
- 非標準角色 → 顯示警告並轉換為 `therapist`（預設值）

**範例：**

```
service_name,executor_role
Pico Laser,beauty_therapist  ← 自動轉換為 therapist
Thermage,doctor              ← 保持不變
```

### 防呆機制

當發現非標準角色時：

```typescript
console.warn(`⚠️ 發現非標準角色: "${rawRole}"，已轉換為 "therapist"`);
```

## 🎨 UI 顯示層規則

### 中文顯示轉換

使用 `getRoleDisplayName()` 函數：

```typescript
import { getRoleDisplayName } from "./data/roleUtils.js";

const displayName = getRoleDisplayName("therapist");
// 返回: "美療師"
```

### 顯示範例

```typescript
// ❌ 錯誤：直接顯示內部名稱
<div>{role}</div>  // 顯示 "therapist"

// ✅ 正確：使用中文顯示名稱
<div>{getRoleDisplayName(role)}</div>  // 顯示 "美療師"
```

## 📝 重要原則

### 1. 資料邏輯層

- ✅ 只使用四種標準角色
- ✅ 不允許 `beauty_therapist` 出現在邏輯判斷中
- ✅ 使用 `StaffRole` 型別確保型別安全

### 2. UI 顯示層

- ✅ 使用 `ROLE_DISPLAY_NAMES` 或 `getRoleDisplayName()`
- ✅ 中文名稱只存在於顯示層
- ✅ 不參與任何邏輯判斷

### 3. 資料來源

- ✅ CSV 檔案可以包含 `beauty_therapist`
- ✅ 載入時自動轉換為 `therapist`
- ✅ 非標準角色顯示警告但不中斷執行

## 🧪 測試結果

### 編譯測試

```bash
npm run build
✅ 編譯成功，無錯誤
```

### 型別檢查

- ✅ 所有 `StaffRole` 型別正確
- ✅ 無 `beauty_therapist` 型別錯誤
- ✅ 所有角色引用符合標準

### 功能測試

- ✅ 資料載入正常
- ✅ 角色轉換正確
- ✅ UI 顯示中文正確

## 📚 相關文件

- `src/data/schema.ts` - 型別定義
- `src/data/roleUtils.ts` - 角色工具函數
- `src/data/dataStore.ts` - 資料清洗邏輯
- `docs/ROLE_REFACTOR_SUMMARY.md` - 重構總結

## 🎯 後續建議

### 1. CSV 檔案更新（可選）

如果想要完全統一，可以更新 CSV 檔案：

```csv
# services.csv
service_name,executor_role
Pico Laser,therapist  ← 直接使用標準名稱
```

### 2. 資料驗證

可以在載入後檢查資料：

```typescript
console.log(
  "Services loaded:",
  dataStore.services.map((s) => ({
    name: s.service_name,
    role: s.executor_role,
  }))
);
```

### 3. 未來擴展

如果需要新增角色：

1. 更新 `StaffType` 定義
2. 更新 `ROLE_DISPLAY_NAMES`
3. 更新相關邏輯

## ✅ 重構完成確認

- [x] 型別定義標準化
- [x] 建立角色標準化工具
- [x] 更新資料清洗邏輯
- [x] 更新所有邏輯模組
- [x] 修正編碼問題
- [x] 編譯測試通過
- [x] 建立完整文件

**重構狀態：✅ 完成**

---

_最後更新：2025-12-14_
_版本：v2.0_
