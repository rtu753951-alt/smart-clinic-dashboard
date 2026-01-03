# 醫療安全與排程風險分析器 - 使用說明

## 概述

這是一個專為醫美診所設計的風險分析模組,產生**精簡、可行動、不卡版面**的 JSON 報告,供前端儀表板使用。

## 核心原則

✅ **保守**:不做激進建議  
✅ **避免評價個人績效**:用角色而非姓名  
✅ **精簡可行動**:每個建議都具體可執行  
✅ **不卡版面**:嚴格控制數量上限

## 使用方式

```typescript
import { analyzeStaffRisks } from "./logic/staff/staffRiskAnalyzer.js";

// 1. 準備角色負載資料 (來自負載卡片)
const roleUtilization = [
  {
    role: "doctor",
    usedHours: 245.6,
    totalHours: 224,
    pct_display: 100,
    pct_raw: 109.6,
    overloadHours: 21.6,
  },
  {
    role: "therapist",
    usedHours: 312.8,
    totalHours: 672,
    pct_display: 47,
    pct_raw: 46.5,
  },
  // ...
];

// 2. 準備本週聚合資料 (前端已先算好)
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
    // ...
  ],
  top_slots: [
    {
      date: "2025-12-23",
      time_bucket: "14:00-18:00",
      role: "doctor",
      total_minutes: 480,
      high_focus_minutes: 190,
      combo_ratio: 65,
    },
    // ...
  ],
};

// 3. 呼叫分析函數
const report = analyzeStaffRisks(
  roleUtilization,
  weeklyAggregates,
  "本週" // 或 '下週' 或 '未來30天'
);

// 4. 使用報告
console.log(report);
```

## 輸出格式

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
    }
  ],
  "review_list": [
    {
      "date": "2025-12-23",
      "time_bucket": "全日",
      "role": "doctor",
      "risk_type": "combo_congestion",
      "reason": "複合療程佔比 61% (17/28 筆)"
    }
  ]
}
```

## 判定規則

### 1. 容量判定 (優先且必須)

- `pct_raw >= 100` 或 `overloadHours > 0` → **RED** capacity alert
- `90 <= pct_raw < 100` → **YELLOW** capacity alert (最多 1 個)

### 2. 複合療程擁擠

- `combo_ratio >= 45%` → **RED** (全視窗最多 2 筆)
- `35% <= combo_ratio < 45%` → **YELLOW** (全視窗最多 2 筆)

### 3. 連續高強度

- `high_focus_minutes >= 180` → **RED**
- `high_focus_minutes >= 120` → **YELLOW**

### 4. 波動風險

- `(cancelled + no_show) / total_visits >= 30%` → **RED**
- `>= 20%` → **YELLOW**

### 5. 去重規則

- 同一 `date + role + type` 只留最高等級那筆
- 不連續列出每天都一樣的 combo 卡,只挑最嚴重的幾天

## 數量上限

| 項目                     | 上限 |
| ------------------------ | ---- |
| `summary.capacity_notes` | 2 句 |
| `summary.risk_notes`     | 2 句 |
| `alerts`                 | 5 筆 |
| `actions`                | 5 點 |
| `review_list`            | 8 筆 |

## 文案限制

### ❌ 禁止使用

- 冗員
- 效率低
- 誰很閒
- 績效不佳
- 產能不足

### ✅ 建議使用

- 插入緩衝
- 避免連排
- 分散複合療程
- 提前二次確認
- 負載集中
- 需要休息
- 風險分散

## 整合到現有頁面

在 `staffPage.ts` 或 `staffWorkloadCards.ts` 中:

```typescript
import { analyzeStaffRisks } from "../logic/staff/staffRiskAnalyzer.js";

// 在計算完 workload data 後
const riskReport = analyzeStaffRisks(
  roleUtilizationData,
  weeklyAggregatesData,
  currentWindowLabel
);

// 渲染到 UI
renderRiskReport(riskReport);
```

## 前端顯示建議

### Summary 區塊

```html
<div class="risk-summary">
  <h3>📊 {window_label} 風險摘要</h3>
  <div class="capacity-notes">
    {capacity_notes.map(note =>
    <p>⚠️ {note}</p>
    )}
  </div>
  <div class="risk-notes">
    {risk_notes.map(note =>
    <p>💡 {note}</p>
    )}
  </div>
</div>
```

### Alerts 區塊

```html
<div class="alerts">
  {alerts.map(alert =>
  <div class="{`alert" alert-${alert.level}`}>
    <div class="alert-header">
      <span class="level-badge">{alert.level === 'red' ? '🔴' : '🟡'}</span>
      <span class="when">{alert.when}</span>
      <span class="who">{ROLE_NAMES[alert.who]}</span>
    </div>
    <div class="evidence">{alert.evidence}</div>
    <div class="why">{alert.why_it_matters}</div>
  </div>
  )}
</div>
```

### Actions 區塊

```html
<div class="actions">
  <h4>💡 建議行動</h4>
  <ul>
    {actions.map(action =>
    <li>
      <strong>{action.action}</strong>
      <span class="target">對象: {action.target}</span>
      <span class="purpose">目的: {action.purpose}</span>
    </li>
    )}
  </ul>
</div>
```

### Review List 表格

```html
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
    <tr>
      <td>{item.date}</td>
      <td>{item.time_bucket}</td>
      <td>{ROLE_NAMES[item.role]}</td>
      <td>{RISK_TYPE_NAMES[item.risk_type]}</td>
      <td>{item.reason}</td>
    </tr>
    )}
  </tbody>
</table>
```

## 檔案位置

- 分析邏輯: `src/logic/staff/staffRiskAnalyzer.ts`
- 型別定義: 包含在同一檔案中
- 使用範例: 本文件

## 注意事項

1. **輸入資料品質**:確保 `weeklyAggregates` 資料已正確聚合
2. **角色名稱一致性**:使用 `doctor/nurse/therapist/consultant`
3. **日期格式**:使用 `YYYY-MM-DD` 格式
4. **數量控制**:嚴格遵守上限,避免 UI 過載
5. **語氣中性**:所有文案都應保持保守、友善的語氣
