# Customer Insights TypeScript 結構分流說明

## ✅ 完成狀態

已成功建立 Customer Insights 的 TypeScript 結構分流，僅進行資料層組織，不改 UI。

---

## 📂 **檔案結構**

```
src/features/customer-insights/
├─ types/
│  ├─ customer.ts          ✅ 顧客基礎型別
│  ├─ rfm.ts               ✅ RFM 分析型別
│  └─ churn.ts             ✅ 流失風險型別
│
├─ selectors/
│  ├─ customerBaseSelector.ts  ✅ 顧客分類選擇器
│  ├─ rfmSelector.ts           ✅ RFM 分析選擇器
│  └─ churnRiskSelector.ts     ✅ 流失風險選擇器
│
├─ hooks/
│  └─ useCustomerInsights.ts   ✅ 顧客洞察 Hook
│
└─ index.ts                ✅ 對外 export
```

---

## 📋 **Type 定義**

### **1. customer.ts**

```typescript
export type Customer = {
  id: string;
  name: string;
  totalVisits: number;
  totalSpend: number;
  lastVisitDate: string;
};

export type CustomerSegment = "new" | "returning";
```

### **2. rfm.ts**

```typescript
export type RFMScore = {
  recency: number;
  frequency: number;
  monetary: number;
};

export type RFMSegment = "high_value" | "medium_value" | "low_value";
```

### **3. churn.ts**

```typescript
export type ChurnRiskLevel = "low" | "medium" | "high";

export type ChurnRiskResult = {
  customerId: string;
  risk: ChurnRiskLevel;
  reason: string;
};
```

---

## 🔍 **Selector 規則**

### **1. customerBaseSelector.ts**

#### **規則**

- **新客**：`totalVisits === 1`
- **回診客**：`totalVisits > 1`

#### **函數**

```typescript
selectCustomersBySegment(customers); // 分類新客與回診客
selectNewCustomers(customers); // 取得新客列表
selectReturningCustomers(customers); // 取得回診客列表
```

---

### **2. rfmSelector.ts**

#### **規則**

- **Recency**：距離今天天數（簡單差值）
- **Frequency**：使用 `totalVisits`
- **Monetary**：使用 `totalSpend`

#### **分群規則**

- **high_value**：`F >= 5` 且 `M >= 平均`
- **low_value**：`F < 3` 或 `M < 平均的一半`
- **medium_value**：其餘

#### **函數**

```typescript
calculateRFMScore(customer); // 計算 RFM 分數
determineRFMSegment(customer, avg); // 判斷 RFM 區段
selectCustomersByRFM(customers); // 分類所有顧客的 RFM 區段
```

---

### **3. churnRiskSelector.ts**

#### **規則**

- **high**：90 天未回診
- **medium**：60-90 天未回診
- **low**：60 天內有回診

#### **函數**

```typescript
calculateChurnRisk(customer); // 計算流失風險等級
selectChurnRisks(customers); // 分析所有顧客的流失風險
selectHighRiskCustomers(customers); // 篩選高風險顧客
selectChurnRisksByLevel(customers); // 依風險等級分組
```

---

## 🪝 **Hook 使用**

### **useCustomerInsights**

#### **回傳格式**

```typescript
{
  newCustomers: Customer[];
  returningCustomers: Customer[];
  rfmSegments: Record<RFMSegment, Customer[]>;
  churnRisks: ChurnRiskResult[];
}
```

#### **使用範例**

```typescript
import { useCustomerInsights } from '@/features/customer-insights';

const customers: Customer[] = [...]; // 從資料源取得

const insights = useCustomerInsights(customers);

console.log('新客數量:', insights.newCustomers.length);
console.log('高價值顧客:', insights.rfmSegments.high_value);
console.log('高風險顧客:', insights.churnRisks.filter(r => r.risk === 'high'));
```

---

## 🔒 **嚴格遵守的限制**

### **已遵守**

- ✅ 不修改任何 UI JSX / layout / style
- ✅ 不新增視覺元件
- ✅ 不改動既有頁面行為
- ✅ 僅進行 TypeScript 檔案結構分流
- ✅ 所有邏輯使用 rule-based（if / filter / map）
- ✅ 不引入任何第三方套件
- ✅ 不影響其他頁面

### **未做的事項**

- ❌ 未調整資料來源
- ❌ 未改變任何 KPI 計算方式
- ❌ 未新增 mock data
- ❌ 未加上 AI / LLM / prompt

---

## ✅ **成功標準**

### **1. 編譯通過**

```bash
npx tsc
# ✅ 編譯成功，無錯誤
```

### **2. UI 不變**

- ✅ 未修改任何 UI 檔案
- ✅ 未影響現有頁面

### **3. 資料流建立**

- ✅ 顧客洞察頁可以開始「有資料流」
- ✅ 後續可逐步替換 selector 邏輯

---

## 📊 **資料流示意**

```
Customer[] (原始資料)
    ↓
useCustomerInsights()
    ↓
├─ selectNewCustomers()        → newCustomers[]
├─ selectReturningCustomers()  → returningCustomers[]
├─ selectCustomersByRFM()      → rfmSegments{}
└─ selectChurnRisks()          → churnRisks[]
    ↓
CustomerInsightsData (統一格式)
```

---

## 🔄 **後續擴充方向**

### **可以做的**

1. 調整 selector 邏輯（更精準的 RFM 計算）
2. 新增更多 selector（例如：地區分析、療程偏好）
3. 優化效能（memo、cache）
4. 加上單元測試

### **不應該做的**

- ❌ 在 selector 中加上 UI 邏輯
- ❌ 在 hook 中直接操作 DOM
- ❌ 引入複雜的 AI 推論

---

## 📝 **使用範例**

### **範例 1：取得新客與回診客**

```typescript
import { useCustomerInsights } from "@/features/customer-insights";

const insights = useCustomerInsights(customers);

console.log(`新客：${insights.newCustomers.length} 位`);
console.log(`回診客：${insights.returningCustomers.length} 位`);
```

### **範例 2：分析高價值顧客**

```typescript
const { rfmSegments } = useCustomerInsights(customers);

const highValueCustomers = rfmSegments.high_value;
console.log(`高價值顧客：${highValueCustomers.length} 位`);
```

### **範例 3：找出高風險顧客**

```typescript
const { churnRisks } = useCustomerInsights(customers);

const highRisk = churnRisks.filter((r) => r.risk === "high");
highRisk.forEach((r) => {
  console.log(`顧客 ${r.customerId}: ${r.reason}`);
});
```

---

## 🧪 **測試檢查清單**

- [x] TypeScript 編譯通過
- [x] 檔案結構正確
- [x] Types 定義完整
- [x] Selectors 邏輯簡單明確
- [x] Hook 組合正確
- [x] index.ts export 完整
- [ ] 整合到顧客洞察頁面（待後續）

---

## 🚀 **下一步**

1. 在顧客洞察頁面中使用 `useCustomerInsights`
2. 將現有的顧客資料轉換為 `Customer[]` 格式
3. 使用 selector 結果更新 UI
4. 逐步替換既有的計算邏輯

---

**🎉 Customer Insights TypeScript 結構分流完成！** 現在有清晰的資料層結構，可以開始建立資料流，後續可逐步替換 selector 邏輯！
