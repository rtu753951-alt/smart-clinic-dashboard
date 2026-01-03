# AI 風險預警引擎 v2.0 - 完成報告

## ✅ 完成的工作

### 1. 角色命名一致性重構

- ✅ 統一使用四種標準角色：`doctor | nurse | therapist | consultant`
- ✅ 移除 `beauty_therapist`，統一為 `therapist`
- ✅ 建立 `roleUtils.ts` 工具函數
- ✅ 更新所有模組使用標準角色

### 2. 療程風險分析優化

- ✅ 新增 **Category → Specialty 對照表**
- ✅ 三重檢查可執行人力：
  1. `executor_role` 相符
  2. `staff.status === "active"`
  3. `staff.specialty` 屬於該 category 對應的專長清單
- ✅ 避免「無可執行人力」誤判

### 3. 人力風險分析

- ✅ 以個人為單位計算負載率
- ✅ 使用實際工時（duration + buffer_time）
- ✅ 風險分級：90%過載 / 70-89%偏高 / <30%閒置

## 📊 Category → Specialty 對照表

| Category | 可執行專長           |
| -------- | -------------------- |
| laser    | 皮秒、雷射、美療     |
| rf       | 電波、音波、美容醫學 |
| inject   | 美容醫學、皮膚科     |
| consult  | 諮詢分析             |
| drip     | 護理                 |

## 🔍 判斷邏輯

### 可執行人力計算

```typescript
const availableStaff = staff.filter((s) => {
  // 1. executor_role 相符
  if (s.staff_type !== executorRole) return false;

  // 2. status === "active"
  if (s.status !== "active") return false;

  // 3. specialty 屬於該 category 對應的專長清單
  const staffSpecialty = s.specialty || "";
  if (!canExecuteCategory(staffSpecialty, category)) return false;

  return true;
});
```

### Specialty 匹配規則

- 使用 `includes()` 進行部分匹配
- 例如：「皮秒雷射」包含「皮秒」→ 匹配成功
- 如果 category 不在對照表中 → 保守判斷為可執行

## 📝 輸出範例

### Console Debug 訊息

```
💉 療程風險分析: {
  totalAppointments: 1000,
  serviceCount: 8
}

  Pico Laser: {
    count: 450,
    category: "laser",
    executorRole: "therapist",
    availableStaff: 2,
    staffDetails: [
      { name: "王美療師", specialty: "皮秒" },
      { name: "林美療師", specialty: "美療" }
    ],
    demandHours: 300,
    supplyHours: 352,
    loadRate: "85%"
  }
```

### 風險預警輸出

**簡要版（卡片）：**

```
🔴 2 位人員本月負載超過 90%，存在過載風險
🟠 Pico Laser 療程負載偏高（85%）
```

**詳細版（彈窗）：**

```
👤 一、人力風險（個人層級）

🔴 陳醫師（doctor）人力負載過高
  風險說明：陳醫師 本月負載率達 92%，已接近或超過可承受上限
  判斷依據：工作天數：22 天｜執行療程：186 次｜實際工時：176 / 176 小時
  💡 管理建議：建議調整未來兩週排班，分流部分高工時療程至其他人員

💉 二、療程風險（療程層級）

🟠 Pico Laser 療程負載偏高（85%）
  風險說明：Pico Laser 需求工時接近供給上限，排程彈性受限
  判斷依據：本月預約：450 筆｜需求工時：300 小時｜供給工時：352 小時｜可執行人數：2 人（therapist）
  💡 管理建議：建議持續觀察，必要時調整排班或增加備援人力
```

## 🧪 測試方式

1. **編譯測試**

   ```bash
   npm run build
   ✅ 編譯成功
   ```

2. **瀏覽器測試**

   - 重新整理瀏覽器（Ctrl+Shift+R）
   - 打開 Console（F12）
   - 查看「💉 療程風險分析」訊息
   - 確認 `staffDetails` 顯示正確

3. **功能驗證**
   - ✅ 無「無可執行人力」誤判
   - ✅ 負載率計算正確
   - ✅ 風險分級合理
   - ✅ 中文顯示正確

## 📚 相關文件

- `src/ai/riskAlertEngine.ts` - 風險預警引擎（已重寫）
- `src/data/roleUtils.ts` - 角色標準化工具
- `docs/ROLE_REFACTOR_COMPLETE.md` - 角色重構完整報告
- `docs/SERVICE_RISK_LOGIC.md` - 療程風險邏輯說明
- `docs/SPECIALTY_FIX_GUIDE.md` - Specialty 修正指南

## 🎯 核心改進總結

### 修正前的問題

1. ❌ 只檢查 `executor_role`，導致誤判「無可執行人力」
2. ❌ 使用 `beauty_therapist` 不一致
3. ❌ 檔案結構損壞，有重複程式碼

### 修正後的狀態

1. ✅ 三重檢查：role + status + specialty
2. ✅ 統一使用 `therapist`
3. ✅ 檔案結構完整，編譯通過

## 🚀 下一步建議

### 1. 資料驗證

在 Console 中檢查：

```javascript
// 檢查 staff 資料
console.log(
  "Staff:",
  dataStore.staff.map((s) => ({
    name: s.staff_name,
    type: s.staff_type,
    specialty: s.specialty,
    status: s.status,
  }))
);

// 檢查 services 資料
console.log(
  "Services:",
  dataStore.services.map((s) => ({
    name: s.service_name,
    category: s.category,
    executor_role: s.executor_role,
  }))
);
```

### 2. 調整閾值（如需要）

在 `riskAlertEngine.ts` 中：

```typescript
// 人力負載閾值
if (loadRate >= 90) { ... }  // 可調整為 85
if (loadRate >= 70) { ... }  // 可調整為 65

// 療程集中閾值
if (concentration > 35) { ... }  // 可調整為 30 或 40
```

### 3. 擴展 Specialty 對照表

如果有新的 category 或 specialty：

```typescript
const CATEGORY_TO_SPECIALTY: Record<string, string[]> = {
  laser: ["皮秒", "雷射", "美療"],
  rf: ["電波", "音波", "美容醫學"],
  inject: ["美容醫學", "皮膚科"],
  consult: ["諮詢分析"],
  drip: ["護理"],
  // 新增其他 category
};
```

## ✅ 完成確認

- [x] 角色命名統一為標準四種
- [x] 建立 Category → Specialty 對照表
- [x] 實作三重檢查邏輯
- [x] 修正所有編譯錯誤
- [x] 編譯測試通過
- [x] 建立完整文件

**狀態：✅ 完成並可投入使用**

---

_最後更新：2025-12-14_
_版本：v2.0_
_編譯狀態：✅ 通過_
