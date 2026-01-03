# 醫療安全與排程風險分析器 - 實作總結

## ✅ 已完成

### 1. 核心分析模組

**檔案**: `src/logic/staff/staffRiskAnalyzer.ts`

**功能**:

- ✅ 容量判定 (capacity)
- ✅ 複合療程擁擠判定 (combo_congestion)
- ✅ 連續高強度判定 (high_focus_streak)
- ✅ 波動風險判定 (volatility)
- ✅ 智能去重與排序
- ✅ 精簡摘要生成
- ✅ 可執行行動建議
- ✅ 人工確認清單

### 2. 輸出格式

嚴格遵守 JSON 格式與數量上限:

```typescript
interface RiskAnalysisReport {
  summary: {
    window_label: string; // "本週" | "下週" | "未來30天"
    capacity_notes: string[]; // 最多 2 句
    risk_notes: string[]; // 最多 2 句
  };
  alerts: RiskAlert[]; // 最多 5 筆
  actions: ActionItem[]; // 最多 5 點
  review_list: ReviewItem[]; // 最多 8 筆
}
```

### 3. 判定規則

#### 容量判定 (優先)

```
pct_raw >= 100 或 overloadHours > 0  → RED
90 <= pct_raw < 100                  → YELLOW (最多1個)
```

#### 複合療程擁擠

```
combo_ratio >= 45%                   → RED (最多2筆)
35% <= combo_ratio < 45%             → YELLOW (最多2筆)
```

#### 連續高強度

```
high_focus_minutes >= 180            → RED
high_focus_minutes >= 120            → YELLOW
```

#### 波動風險

```
(cancelled + no_show) / total >= 30% → RED
>= 20%                               → YELLOW
```

### 4. 去重邏輯

- 同一 `date + role + type` 只保留最高等級
- 複合療程卡不連續列出,只挑最嚴重的幾天
- 優先顯示 RED alerts

### 5. 文案原則

#### ✅ 使用

- 插入緩衝
- 避免連排
- 分散複合療程
- 提前二次確認
- 負載集中
- 需要休息
- 風險分散
- 維持品質

#### ❌ 禁止

- 冗員
- 效率低
- 誰很閒
- 績效不佳
- 產能不足
- 人員評比

## 📁 檔案清單

1. **`src/logic/staff/staffRiskAnalyzer.ts`** - 核心分析邏輯 (約 550 行)
2. **`docs/STAFF_RISK_ANALYZER_GUIDE.md`** - 完整使用說明
3. **`test/staffRiskAnalyzer.test.ts`** - 測試範例

## 🎯 使用範例

```typescript
import { analyzeStaffRisks } from "./logic/staff/staffRiskAnalyzer.js";

// 準備資料
const roleUtilization = [
  {
    role: "doctor",
    usedHours: 245.6,
    totalHours: 224,
    pct_display: 100,
    pct_raw: 109.6,
    overloadHours: 21.6,
  },
];

const weeklyAggregates = {
  by_role_day: [
    {
      date: "2025-12-23",
      role: "doctor",
      total_visits: 28,
      combo_visits: 17,
      combo_ratio: 60.7,
      high_focus_minutes: 190,
      total_minutes: 1680,
      cancelled: 2,
      no_show: 1,
    },
  ],
  top_slots: [],
};

// 執行分析
const report = analyzeStaffRisks(roleUtilization, weeklyAggregates, "本週");

// 輸出 JSON
console.log(JSON.stringify(report, null, 2));
```

## 📊 輸出範例

```json
{
  "summary": {
    "window_label": "本週",
    "capacity_notes": ["醫師負載已達或超過滿載，需評估人力配置"],
    "risk_notes": [
      "發現複合療程集中與連續高強度排程情況，建議適度分散以維持品質"
    ]
  },
  "alerts": [
    {
      "level": "red",
      "type": "capacity",
      "when": "整體視窗",
      "who": "doctor",
      "evidence": "負載率 110%，超載 +21.6h",
      "why_it_matters": "可能影響服務品質與員工健康，建議評估是否需要增加人力或分散排程"
    },
    {
      "level": "red",
      "type": "combo_congestion",
      "when": "2025-12-23 (一)",
      "who": "doctor",
      "evidence": "複合療程佔比 61% (17/28 筆)",
      "why_it_matters": "複雜度集中可能影響專注度與服務品質，建議分散排程"
    },
    {
      "level": "red",
      "type": "high_focus_streak",
      "when": "2025-12-23 (一)",
      "who": "doctor",
      "evidence": "連續高強度 190 分鐘",
      "why_it_matters": "長時間高強度工作易致疲勞，建議插入 10-20 分鐘休息緩衝"
    }
  ],
  "actions": [
    {
      "action": "評估是否需要增加人力或將部分可轉移療程分散至其他時段",
      "target": "doctor",
      "purpose": "避免過載影響服務品質與員工健康"
    },
    {
      "action": "將部分複合療程分散至其他日期或時段",
      "target": "doctor",
      "purpose": "降低單日複雜度、提升專注力"
    },
    {
      "action": "在連續高強度療程之間插入 10-20 分鐘休息緩衝",
      "target": "doctor",
      "purpose": "維持專注力與服務品質"
    }
  ],
  "review_list": [
    {
      "date": "2025-12-23",
      "time_bucket": "全日",
      "role": "doctor",
      "risk_type": "combo_congestion",
      "reason": "複合療程佔比 61% (17/28 筆)"
    },
    {
      "date": "2025-12-23",
      "time_bucket": "全日",
      "role": "doctor",
      "risk_type": "high_focus_streak",
      "reason": "連續高強度 190 分鐘"
    }
  ]
}
```

## 🔗 前端整合建議

### 在 staffWorkloadCards.ts 中整合

```typescript
import { analyzeStaffRisks } from "./staffRiskAnalyzer.js";

export function renderWorkloadCards(period: string) {
  // ... 現有的卡片渲染邏輯

  // 計算 role utilization
  const roleUtilization = calculateRoleUtilization(period);

  // 聚合本週資料
  const weeklyAggregates = aggregateWeeklyData(period);

  // 執行風險分析
  const riskReport = analyzeStaffRisks(
    roleUtilization,
    weeklyAggregates,
    period === "week" ? "本週" : period === "next_week" ? "下週" : "未來30天"
  );

  // 渲染風險報告
  renderRiskReport(riskReport);
}
```

### UI 顯示建議

```html
<!-- Summary 區塊 -->
<div class="risk-summary-card">
  <h3>📊 {window_label} 風險摘要</h3>
  <div class="capacity-notes">
    {capacity_notes.map(note =>
    <p class="warning">⚠️ {note}</p>
    )}
  </div>
  <div class="risk-notes">
    {risk_notes.map(note =>
    <p class="info">💡 {note}</p>
    )}
  </div>
</div>

<!-- Alerts 區塊 -->
<div class="alerts-section">
  {alerts.map(alert =>
  <div class="{`alert-card" alert-${alert.level}`}>
    <div class="alert-badge">{alert.level === 'red' ? '🔴' : '🟡'}</div>
    <div class="alert-content">
      <div class="alert-header">
        <span class="when">{alert.when}</span>
        <span class="who">{ROLE_NAMES[alert.who]}</span>
      </div>
      <div class="evidence">{alert.evidence}</div>
      <div class="why-matters">{alert.why_it_matters}</div>
    </div>
  </div>
  )}
</div>

<!-- Actions 區塊 -->
<div class="actions-section">
  <h4>💡 建議行動</h4>
  <ul class="action-list">
    {actions.map(action =>
    <li class="action-item">
      <div class="action-text">{action.action}</div>
      <div class="action-meta">
        <span class="target">對象: {action.target}</span>
        <span class="purpose">目的: {action.purpose}</span>
      </div>
    </li>
    )}
  </ul>
</div>

<!-- Review List 表格 -->
<table class="review-table">
  <thead>
    <tr>
      <th>日期</th>
      <th>時段</th>
      <th>角色</th>
      <th>風險類型</th>
      <th>原因</th>
    </tr>
  </thead>
  <tbody>
    {review_list.map(item =>
    <tr class="{`risk-${item.risk_type}`}">
      <td>{item.date}</td>
      <td>{item.time_bucket}</td>
      <td>{ROLE_NAMES[item.role]}</td>
      <td>{RISK_TYPE_LABELS[item.risk_type]}</td>
      <td>{item.reason}</td>
    </tr>
    )}
  </tbody>
</table>
```

## ✅ 編譯狀態

TypeScript 編譯成功,無錯誤!

## 📝 下一步

1. 在 `staffWorkloadCards.ts` 中實作 `aggregateWeeklyData()` 函數
2. 整合到現有的卡片渲染流程
3. 添加 CSS 樣式
4. 測試不同情境的輸出

## 🎯 核心優勢

✅ **精簡**: 嚴格控制數量,不卡版面  
✅ **可行動**: 每個建議都具體可執行  
✅ **保守**: 不做激進建議,避免評價個人  
✅ **結構化**: JSON 格式,易於前端處理  
✅ **智能**: 自動去重、排序、優先級判定
