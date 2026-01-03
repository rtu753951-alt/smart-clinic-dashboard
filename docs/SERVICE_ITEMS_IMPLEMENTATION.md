# Service Items 複合療程支援 - 改動總結

## 完成的改動

### 1. **schema.ts** - 添加 `service_items` 型別定義

```typescript
export interface AppointmentRecord {
  // ... 其他欄位
  service_item: string;
  service_items?: string; // 🔥 複合療程欄位 (例如 "Thermage;Botox;Consultation")
  // ... 其他欄位
}
```

### 2. **dataStore.ts** - CSV 解析支援 `service_items`

```typescript
// 在 appointments 解析中添加:
service_items: String(raw.service_items ?? "").trim() || undefined, // 🔥 複合療程欄位
  // 添加 debug logs:
  console.log(
    "[debug] service_items example:",
    this.appointments[0]?.service_items
  );
const withServiceItems = this.appointments.filter(
  (a) => a.service_items
).length;
console.log(
  `[debug] Appointments with service_items: ${withServiceItems}/${this.appointments.length}`
);
```

### 3. **staffWorkloadChart.ts** - 計算邏輯支援複合療程

#### 3.1 角色正規化函數

```typescript
function normalizeRole(
  role?: string
): "doctor" | "consultant" | "nurse" | "therapist" {
  const r = (role || "").toLowerCase().trim();
  if (r === "beauty_therapist" || r === "beauty-therapist") return "therapist";
  if (r === "therapist") return "therapist";
  if (r === "nurse") return "nurse";
  if (r === "consultant") return "consultant";
  return "doctor";
}
```

#### 3.2 Service Items 解析函數

```typescript
function parseServiceItems(apt: any): string[] {
  const raw = (apt.service_items || "").trim();
  if (raw) {
    return raw
      .split(/[;,]+/) // 支援 ; 或 , 分隔
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
  // 沒有 service_items 就退回 service_item
  const base = (apt.service_item || "").trim();
  return base ? [base] : [];
}
```

#### 3.3 計算邏輯改為迴圈處理多個療程

```typescript
filteredAppointments.forEach((apt) => {
  const items = parseServiceItems(apt); // 取得療程列表

  if (items.length === 0) return; // 避免 NaN

  // 統計 service_items 使用情況
  if (apt.service_items) {
    appointmentsWithServiceItems++;
    totalServiceItemsCount += items.length;
  }

  items.forEach((serviceName) => {
    const service = dataStore.services.find(
      (s) => s.service_name === serviceName
    );

    // 記錄 mismatch
    if (!service) {
      mismatchCount++;
    }

    // 每個療程獨立計算工時
    const duration = service ? service.duration : 30;
    const buffer = service ? service.buffer_time : 10;
    const totalMinutes = duration + buffer;

    // 以 service.executor_role 為主
    const primaryRole = normalizeRole(service?.executor_role || apt.staff_role);

    // 套用 INVOLVEMENT_RATIOS 和護理師協助工時規則
    // ...
  });
});
```

#### 3.4 驗收 Debug Logs

```typescript
console.log("═══════════════════════════════════════════════");
console.log("📊 人力負載計算驗收報告 (月份:", targetMonth, ")");
console.log("═══════════════════════════════════════════════");
console.log("📋 Service Items 統計:");
console.log(
  `  - 有 service_items 的預約: ${appointmentsWithServiceItems}/${filteredAppointments.length}`
);
console.log(
  `  - service_items 平均項目數: ${
    appointmentsWithServiceItems > 0
      ? (totalServiceItemsCount / appointmentsWithServiceItems).toFixed(2)
      : 0
  }`
);
console.log(`  - Mismatch serviceName 筆數: ${mismatchCount}`);
console.log("");
console.log("👥 各角色負載率:");
result.forEach((r) => {
  console.log(
    `  ${ROLE_NAMES[r.role]}: ${r.usedHours}h / ${r.totalHours}h (${
      r.percentage
    }%)`
  );
});
console.log("═══════════════════════════════════════════════");
```

## 驗收方式

1. **打開瀏覽器 Console**
2. **載入頁面** - 會看到:

   ```
   [debug] service_items example: Thermage;Botox;Consultation
   [debug] Appointments with service_items: 1234/5678
   ```

3. **切換到人力分析頁** - 會看到:

   ```
   ═══════════════════════════════════════════════
   📊 人力負載計算驗收報告 (月份: 2025-12 )
   ═══════════════════════════════════════════════
   📋 Service Items 統計:
     - 有 service_items 的預約: 1234/5000
     - service_items 平均項目數: 2.34
     - Mismatch serviceName 筆數: 12

   👥 各角色負載率:
     醫師: 245.6h / 896h (27%)
     諮詢師: 89.3h / 224h (40%)
     護理師: 156.2h / 448h (35%)
     美療師: 312.8h / 672h (47%)
   ═══════════════════════════════════════════════
   ```

## 預期效果

- **複合療程會被正確計算**:例如 "Thermage;Botox;Consultation" 會被拆成 3 個療程,每個獨立計算工時
- **負載率會比改前更高**:因為複合療程的總工時 = 各療程工時相加
- **角色工時更準確**:每個療程使用自己的 executor_role,而非整筆預約的 staff_role

## 保留的功能

✅ 本週/下週/未來 30 天切換機制  
✅ 月份選單同步  
✅ INVOLVEMENT_RATIOS 介入比例模型  
✅ 護理師協助工時規則 (0.25 for doctor, 0.15 for therapist)  
✅ 今天之前只計算 completed,今天之後全部計算  
✅ UI 結構完全不變

## 檔案清單

1. `src/data/schema.ts` - 添加 `service_items?: string`
2. `src/data/dataStore.ts` - CSV 解析 + debug logs
3. `src/logic/staff/staffWorkloadChart.ts` - 計算邏輯 + 驗收 logs

## 編譯狀態

✅ TypeScript 編譯成功,無錯誤
