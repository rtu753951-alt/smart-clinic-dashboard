# AI 風險預警引擎 - 架構重構完成報告

## 🎯 重構目標

將單一的 `riskAlertEngine.ts` 拆分為兩個完全獨立的引擎：

1. **HumanRiskEngine** - 人力風險引擎
2. **ServiceRiskEngine** - 療程風險引擎

## 📁 檔案結構

```
src/ai/
├── humanRiskEngine.ts      # 人力風險引擎（獨立）
├── serviceRiskEngine.ts    # 療程風險引擎（獨立）
└── riskAlertEngine.ts      # 整合層（僅整合輸出）
```

## 1️⃣ HumanRiskEngine（人力風險引擎）

### 職責範圍

- ✅ 僅負責「人力負載 / 排班風險」
- ✅ 判斷單位：**個人**（staff_name）
- ❌ 嚴禁使用療程相關邏輯（category、executor_role、specialty）

### 輸出內容

- 個人過勞風險（負載率 ≥ 90%）
- 個人負載偏高（負載率 70-89%）
- 個人利用率偏低（負載率 < 30%）

### 計算邏輯

```typescript
負載率 = (實際工時 / 可承受工時) × 100%

其中：
- 實際工時 = Σ (service.duration + buffer_time)
- 可承受工時 = 工作天數 × 8 小時
```

### 輸出範例

```typescript
{
  type: "human",
  level: "critical",
  icon: "🔴",
  staffName: "陳醫師",
  staffType: "doctor",
  summary: "陳醫師（doctor）人力負載過高",
  detail: "陳醫師 本月負載率達 92%，已接近或超過可承受上限",
  reason: "工作天數：22 天｜執行療程：186 次｜實際工時：176 / 176 小時",
  suggestion: "建議調整未來兩週排班，分流部分高工時療程至其他人員",
  metadata: {
    loadRate: 92,
    workDays: 22,
    totalHours: 176,
    maxCapacity: 176,
    appointmentCount: 186
  }
}
```

## 2️⃣ ServiceRiskEngine（療程風險引擎）

### 職責範圍

- ✅ 僅負責「療程執行風險」
- ✅ 判斷單位：**療程**（service_name）
- ❌ 嚴禁計算個人負載百分比
- ❌ 嚴禁出現 Infinity、0 人（除非 staff 完全不存在）

### 輸出內容

- 缺乏可執行人力（真的 0 人）
- 單點人力風險（1 人 + 高預約量）
- 高工時療程人力集中（≥ 45 分鐘 + ≤ 2 人）
- 人力集中於單一技能等級
- 預約高度集中（> 35%）
- 人力瓶頸風險（≤ 2 人 + > 10%）

### 可執行人力判斷

```typescript
可執行 = (
  staff.staff_type === service.executor_role
  AND staff.status === "active"
  AND (
    certified_services 包含該療程
    OR specialty 與 category 合理對應
  )
)
```

### 輸出範例

```typescript
{
  type: "service",
  level: "warning",
  icon: "🟠",
  serviceName: "Pico Laser",
  summary: "Pico Laser 人力集中風險",
  detail: "Pico Laser 可執行人員全為資深等級，缺乏技能等級多樣性",
  reason: "本月預約：450 筆｜可執行人數：2 人｜技能分布：資深 2 人",
  suggestion: "建議培訓其他等級人員，建立梯隊式人力結構",
  metadata: {
    appointmentCount: 450,
    availableStaffCount: 2,
    skillDistribution: { senior: 2, mid: 0, junior: 0 }
  }
}
```

## 3️⃣ RiskAlertEngine（整合層）

### 職責範圍

- ✅ 整合 HumanRiskEngine 和 ServiceRiskEngine 的輸出
- ✅ 提供統一的介面給 UI 層
- ❌ 不包含任何風險判斷邏輯

### 整合邏輯

```typescript
export function generateRiskAlerts(input: RiskAlertInput): RiskAlertOutput {
  // 1. 分析人力風險
  const humanRisks = analyzeHumanRisks(humanRiskInput);

  // 2. 分析療程風險
  const serviceRisks = analyzeServiceRisks(serviceRiskInput);

  // 3. 整合結果
  const allAlerts = [...humanRisks.details, ...serviceRisks.details];

  // 4. 生成整合摘要
  const summary = generateIntegratedSummary(
    humanRisks.summary,
    serviceRisks.summary
  );

  return { summary, details: allAlerts };
}
```

### 摘要整合規則

1. 優先顯示人力風險摘要
2. 再顯示療程風險摘要（最多 2 個）
3. 總計最多 4 行

## 🔒 獨立性保證

### 兩個引擎完全獨立

- ❌ 不可互相 import
- ❌ 不可共用判斷函式
- ✅ 僅在整合層（riskAlertEngine.ts）彙整輸出

### 檔案依賴關係

```
humanRiskEngine.ts
  ↓ (不依賴)

serviceRiskEngine.ts
  ↓ (不依賴)

riskAlertEngine.ts
  ↓ (僅 import 兩個引擎)
  ├─ import { analyzeHumanRisks } from "./humanRiskEngine"
  └─ import { analyzeServiceRisks } from "./serviceRiskEngine"

overviewPage.ts
  ↓ (僅 import 整合層)
  └─ import { generateRiskAlerts } from "./ai/riskAlertEngine"
```

## 📊 Console Debug 訊息

### HumanRiskEngine

```
👤 個人工作負載分析: [
  { name: "陳醫師", type: "doctor", days: 22, hours: 176, count: 186 },
  { name: "李醫師", type: "doctor", days: 20, hours: 145, count: 150 },
  ...
]

  陳醫師 (doctor): {
    workDays: 22,
    totalHours: 176,
    maxCapacity: 176,
    loadRate: "100%"
  }
```

### ServiceRiskEngine

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
    skillDistribution: { senior: 1, mid: 1, junior: 0 },
    staffDetails: [
      { name: "王美療師", specialty: "皮秒", skillLevel: "senior", ... },
      { name: "林美療師", specialty: "電波", skillLevel: "mid", ... }
    ]
  }
```

## 🧪 測試結果

### 編譯測試

```bash
npm run build
✅ 編譯成功，無錯誤
```

### 功能驗證

- ✅ HumanRiskEngine 獨立運作
- ✅ ServiceRiskEngine 獨立運作
- ✅ 整合層正確彙整輸出
- ✅ UI 層正常顯示

## 📝 使用方式

### 在 overviewPage.ts 中

```typescript
import { generateRiskAlerts } from "./ai/riskAlertEngine.js";

const riskAlerts = generateRiskAlerts({
  appointments: dataStore.appointments,
  services: dataStore.services,
  staff: dataStore.staff,
  targetMonth: "2024-01",
});

// riskAlerts.summary: 整合摘要
// riskAlerts.details: 所有風險詳情
```

### 分別使用兩個引擎（如需要）

```typescript
// 僅分析人力風險
import { analyzeHumanRisks } from "./ai/humanRiskEngine.js";
const humanRisks = analyzeHumanRisks({ ... });

// 僅分析療程風險
import { analyzeServiceRisks } from "./ai/serviceRiskEngine.js";
const serviceRisks = analyzeServiceRisks({ ... });
```

## ✅ 完成確認

- [x] HumanRiskEngine 建立完成
- [x] ServiceRiskEngine 建立完成
- [x] RiskAlertEngine 重寫為整合層
- [x] 兩個引擎完全獨立
- [x] 編譯測試通過
- [x] 建立完整文件

**狀態：✅ 架構重構完成**

---

_最後更新：2025-12-15_
_版本：v3.0 (架構重構版)_
_編譯狀態：✅ 通過_
