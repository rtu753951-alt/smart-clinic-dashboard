# 本日 KPI 與月份 KPI 分離說明

## ✅ 修改完成

已嚴格分離「本日 KPI」和「月份 KPI」的資料來源和更新邏輯。

---

## 🎯 核心原則

### **時間維度是 KPI 的一部分，不是 UI 狀態**

- **本日 KPI**：永遠使用系統今日，不受月份選單影響
- **月份 KPI**：使用選定月份，可包含預測或未來資料

---

## 📊 KPI 分類

### **本日 KPI（永遠使用系統今日）**

1. **今日預約**

   - 計算：`appointments.filter(a => a.date === systemToday)`
   - 不檢查 status
   - 不檢查 selectedMonth
   - 不檢查 completed_at / created_at

2. **今日到診率**

   - 計算：`todayCompleted / todayAppointments * 100`
   - 只統計 `status === "completed"` 或 `"checked_in"`

3. **人力出勤**
   - 醫師出勤
   - 護理/美療
   - 諮詢師
   - 直接從 `staff` 資料統計 `status === "active"` 的人員

### **月份 KPI（使用選定月份）**

1. **本月營收**

   - 使用 `currentDashboardMonth`
   - 可包含未來預約（預估）

2. **本月回診率**

   - 使用 `currentDashboardMonth`

3. **診間/設備使用率**

   - 使用 `currentDashboardMonth`

4. **醫師 Top3 / 熱門療程 Top3**

   - 使用 `currentDashboardMonth`

5. **AI 洞察分析**

   - 使用 `currentDashboardMonth`

6. **未來趨勢雷達**
   - 分析未來 14-30 天

---

## 🔧 修改的檔案

### **1. src/logic/kpiEngine.ts**

#### **修改前（錯誤）**

```typescript
// 今天日期 = CSV 最新日期
const today = getLatestDate(appointments);
```

#### **修改後（正確）**

```typescript
// 🎯 系統今日（永遠使用實際今天，不受月份選單影響）
const systemToday = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

// 🎯 本日所有預約（不檢查 status）
const todayAppointments = appointments.filter((a) => a.date === systemToday);
```

#### **新增 Debug 輸出**

```typescript
console.log("[KPI][Today]", {
  date: systemToday,
  total: todayTotal,
  completed: todayShow,
  showRate: showRate,
});
```

---

### **2. src/pages/overviewPage.ts**

#### **新增函數**

##### **initOverviewPage()**

- 首次載入時調用
- 包含本日 KPI + 月份 KPI
- 只綁定一次 modal interactions

##### **refreshOverviewPageByMonth()** ✨ 新增

- 月份切換時調用
- **只更新月份相關內容**
- **不更新本日 KPI**

##### **refreshMonthlyContent()** ✨ 新增

- 內部函數
- 統一更新所有月份相關內容

#### **函數結構**

```typescript
export function initOverviewPage() {
  // 🎯 本日 KPI（永遠使用系統今日）
  updateTodayKPI();

  // 📅 月份相關內容
  refreshMonthlyContent();

  // 綁定 modal（只需一次）
  bindOverviewCards();
}

export function refreshOverviewPageByMonth() {
  // 📅 只更新月份相關內容
  refreshMonthlyContent();
  // ❌ 不更新本日 KPI
}

function refreshMonthlyContent() {
  updateRevenueStatus();
  updateMonthlyRevenue();
  updateReturnVisitRate();
  updateDoctorTop3();
  updateTreatmentTop3();
  updateRoomAndEquipmentUsage();
  updateAISummaryBlocks();
  updateFutureTrendsRadar();
}
```

---

### **3. src/ui/pageController.ts**

#### **修改月份切換邏輯**

##### **修改前（錯誤）**

```typescript
monthSelect.addEventListener("change", () => {
  (window as any).currentDashboardMonth = monthSelect.value;

  // 重新呼叫該頁 init（會導致本日 KPI 也被重新計算）
  if (init && typeof (window as any)[init] === "function") {
    (window as any)[init]();
  }
});
```

##### **修改後（正確）**

```typescript
monthSelect.addEventListener("change", () => {
  (window as any).currentDashboardMonth = monthSelect.value;

  const pageId = activePage?.id;

  // 🎯 Overview 頁面：只更新月份相關內容，不更新本日 KPI
  if (
    pageId === "overview" &&
    typeof (window as any).refreshOverviewPageByMonth === "function"
  ) {
    (window as any).refreshOverviewPageByMonth();
  }
  // 其他頁面：重新呼叫 init
  else if (init && typeof (window as any)[init] === "function") {
    (window as any)[init]();
  }
});
```

---

## ✅ 驗收條件

### **1. 切換月份到「未來」**

- ✅ 本日預約數值不變
- ✅ 今日到診率數值不變
- ✅ 人力出勤數值不變
- ✅ 本月營收可顯示「預估」

### **2. CSV 手動計算**

- ✅ 手動計算今天 date 的筆數
- ✅ 與本日預約卡片完全一致

### **3. 月份 KPI**

- ✅ 可顯示「預估」
- ✅ 不影響任何本日 KPI

---

## 🚫 已移除的錯誤模式

- ❌ 本日 KPI 使用 `filteredAppointments`
- ❌ 本日 KPI 使用 `selectedMonth`
- ❌ 本日 KPI 使用 `completed_at`
- ❌ 本日 KPI 在 selector change 時重新計算
- ❌ 使用 `getLatestDate()` 取得「CSV 最後一天」作為今天

---

## 📝 資料來源定義

### **系統今日（System Today）**

```typescript
const systemToday = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
```

### **原始資料（Raw Appointments）**

```typescript
const rawAppointments = dataStore.appointments; // 完全不過濾
```

### **月份資料（Appointments By Selected Month）**

```typescript
const appointmentsBySelectedMonth = appointments.filter((a) =>
  a.date.startsWith(currentDashboardMonth)
);
```

---

## 🧪 測試步驟

### **測試 1：本日 KPI 不受月份選單影響**

1. 記錄當前「今日預約」和「今日到診率」的數值
2. 切換月份選單到未來月份（例如：2026-02）
3. 確認「今日預約」和「今日到診率」數值**完全不變**
4. 確認「本月營收」等月份 KPI 已更新

### **測試 2：CSV 手動驗證**

1. 打開 `appointments.csv`
2. 手動計算今天日期（2025-12-15）的預約筆數
3. 對比儀表板「今日預約」數值
4. 確認**完全一致**

### **測試 3：Console 輸出**

1. 打開瀏覽器 Console
2. 查看 `[KPI][Today]` 輸出
3. 確認 `date` 為系統今日
4. 確認 `total` 和 `completed` 數值正確

---

## 🎉 修改完成

現在本日 KPI 和月份 KPI 已完全分離：

- ✅ 本日 KPI 永遠使用系統今日
- ✅ 月份 KPI 使用選定月份
- ✅ 月份切換不影響本日 KPI
- ✅ 時間維度是 KPI 的一部分，不是 UI 狀態
