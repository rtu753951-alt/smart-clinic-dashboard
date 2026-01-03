# AI 風險預警 Debug 指南

## 🔍 如何檢查風險預警是否正確

### 1. 打開瀏覽器開發者工具

1. 開啟 `index.html`
2. 按 `F12` 打開開發者工具
3. 切換到 `Console` 標籤

### 2. 查看 Debug 訊息

當頁面載入時，你會看到以下 debug 訊息：

```
🚨 AI 風險預警 - 分析月份: 2026-02
📊 可用資料: {
  appointments: 46005,
  staffWorkload: 8125,
  services: 15,
  staff: 10
}
📊 人力負載分析: {
  targetMonth: "2026-02",
  totalWorkloadRecords: 280,
  staffTypes: ["doctor", "nurse", "beauty_therapist", "consultant"]
}
  doctor: {
    totalWork: 150,
    workDays: 20,
    maxCapacity: 320,
    loadRate: "47%"
  }
  nurse: {
    totalWork: 50,
    workDays: 15,
    maxCapacity: 240,
    loadRate: "21%"
  }
  ...
🚨 風險預警結果: {
  summaryCount: 3,
  detailsCount: 5,
  summary: ["⚠️ ...", "⚠️ ...", "✅ ..."]
}
```

### 3. 驗證資料一致性

#### 檢查項目 1：月份是否正確

- 確認「分析月份」與月份選擇器選擇的月份一致
- 例如：如果選擇 `2026-02`，debug 訊息應該顯示 `targetMonth: "2026-02"`

#### 檢查項目 2：人力負載計算是否合理

- 檢查 `workDays`（工作天數）是否合理
  - 2 月通常有 28 天
  - 如果 `workDays` 是 20，表示該人員在 2 月工作了 20 天
- 檢查 `totalWork`（總工作次數）
  - 這是該人員在本月執行的總服務次數
- 檢查 `loadRate`（負載率）
  - 計算公式：`(totalWork / (workDays × 16)) × 100%`
  - 假設每天最多 16 個時段（8 小時 × 2）

#### 檢查項目 3：預約完成率

在 Console 中手動檢查：

```javascript
// 取得本月預約資料
const targetMonth = window.currentDashboardMonth;
const monthData = dataStore.appointments.filter((a) =>
  a.date.startsWith(targetMonth)
);

// 計算完成率
const completed = monthData.filter((a) => a.status === "completed").length;
const total = monthData.length;
const completedRate = Math.round((completed / total) * 100);

console.log("本月預約完成率:", completedRate + "%");
console.log("總預約:", total, "完成:", completed);
```

### 4. 常見問題排查

#### 問題 1：風險預警顯示「無風險」，但圖表顯示有異常

**可能原因：**

- 閾值設定太寬鬆
- 資料篩選有問題

**檢查方式：**

1. 查看 Console 中的 `人力負載分析` 訊息
2. 確認 `loadRate` 是否真的低於 75%
3. 如果 `loadRate` 很高但沒有觸發警告，檢查 `riskAlertEngine.ts` 中的閾值設定

#### 問題 2：風險預警顯示的數字與圖表不一致

**可能原因：**

- 月份選擇不一致
- 資料篩選邏輯不同

**檢查方式：**

1. 確認 `currentDashboardMonth` 的值
2. 檢查 KPI Engine 和 Risk Alert Engine 是否使用相同的月份
3. 檢查資料篩選條件（例如：是否包含 `cancelled` 狀態）

#### 問題 3：人力負載率計算不準確

**可能原因：**

- `staff_workload.csv` 資料不完整
- `staff.csv` 中的 `staff_type` 對應不正確

**檢查方式：**

```javascript
// 檢查 staff_workload 資料
const targetMonth = window.currentDashboardMonth;
const workloadData = dataStore.staffWorkload.filter((w) =>
  w.date.startsWith(targetMonth)
);
console.log("本月工作負載記錄:", workloadData.length);
console.log("範例:", workloadData.slice(0, 5));

// 檢查 staff 資料
console.log("人員資料:", dataStore.staff);
```

### 5. 調整閾值

如果你認為風險預警太敏感或太不敏感，可以調整 `src/ai/riskAlertEngine.ts` 中的閾值：

```typescript
// 人力負載風險
if (loadRate > 85) {
  // 改為 80 會更敏感
  // 觸發 critical 警告
} else if (loadRate > 75) {
  // 改為 70 會更敏感
  // 觸發 warning 警告
}

// 人力閒置風險
if (loadRate < 30) {
  // 改為 40 會更敏感
  // 觸發 warning 警告
}

// 預約完成率
if (completedRate < 70) {
  // 改為 75 會更敏感
  // 觸發 critical 警告
}
```

### 6. 手動測試範例

在 Console 中執行：

```javascript
// 1. 檢查當前月份
console.log("當前分析月份:", window.currentDashboardMonth);

// 2. 檢查本月預約資料
const monthAppts = dataStore.appointments.filter((a) =>
  a.date.startsWith(window.currentDashboardMonth)
);
console.log("本月預約數:", monthAppts.length);

// 3. 檢查本月工作負載
const monthWorkload = dataStore.staffWorkload.filter((w) =>
  w.date.startsWith(window.currentDashboardMonth)
);
console.log("本月工作負載記錄:", monthWorkload.length);

// 4. 手動觸發風險預警
import { generateRiskAlerts } from "./dist/ai/riskAlertEngine.js";
const alerts = generateRiskAlerts({
  appointments: dataStore.appointments,
  staffWorkload: dataStore.staffWorkload,
  services: dataStore.services,
  staff: dataStore.staff,
  targetMonth: window.currentDashboardMonth,
});
console.log("風險預警:", alerts);
```

## 📝 回報問題時請提供

1. 選擇的月份（例如：2026-02）
2. Console 中的 debug 訊息截圖
3. 預期看到的風險 vs 實際顯示的風險
4. 相關圖表的截圖

這樣我才能快速定位問題並修正！
