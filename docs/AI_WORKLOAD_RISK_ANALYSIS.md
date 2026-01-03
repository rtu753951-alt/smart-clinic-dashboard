# AI 人力負荷與營運風險分析模組

## 概述

本模組專注於**醫療安全、服務品質與員工過勞預防**,提供保守、可執行、不中傷個人的風險摘要與建議。

## 核心原則

1. **以風險為中心**:不做績效排名,不點名批評個人
2. **實際工作負荷**:使用 `duration + buffer_time` 計算佔用分鐘數
3. **強度判定**:優先使用 `focus_override`,否則使用 `services.intensity_level`
4. **複合療程判定**:`service_items >= 2` 或 `case_flag=combo`
5. **狀態篩選**:只看 `booked`, `checked_in`, `completed` 作為工作負荷基礎

## 風險分級

### 1. 連續高強度風險

- **黃色 (需注意)**:連續高強度 >= 120 分鐘
- **紅色 (建議介入)**:連續高強度 >= 180 分鐘

### 2. 複合療程擁擠風險

- **黃色**:combo 筆數 >= 3 或 combo 佔比 >= 35%
- **紅色**:combo 佔比 >= 45%

### 3. 高波動風險(取消/爽約)

- **黃色**:某時段 cancelled+no_show >= 20%
- **紅色**:某時段 cancelled+no_show >= 30%

## 輸出格式

### A) 本週風險摘要

3-5 行,使用中性語氣

### B) 風險發現

最多 5 點,每點包含:

- 風險類型
- 發生日期/時段
- 判定原因
- 風險等級 (黃色/紅色)

### C) 立即可做的調整建議

3-6 點,具體到「做什麼」與「目的」

### D) 需要人工確認的清單

最多 8 條,包含:

- 日期
- 時段
- 角色 (而非姓名)
- 療程類型
- 原因

### E) 對員工友善的提醒文案

1-2 行,強調目的是保護品質與避免過勞

## 建議策略

1. **插入緩衝/休息**:10-20 分鐘
2. **分散可轉移項目**:將 `transferable=yes` 的低/中強度項目避開高強度連排時段
3. **二次確認機制**:對高波動時段採取預約前一日確認
4. **候補名單**:當有取消時可快速遞補

## 語氣限制

### ❌ 不使用

- 效率
- 冗員
- 產能最大化
- 誰比較閒

### ✅ 使用

- 負載集中
- 連續高強度
- 需要緩衝
- 風險分散

## 使用方式

```typescript
import {
  generateWorkloadRiskReport,
  ServiceInfo,
} from "../logic/aiWorkloadRiskAnalyzer.js";

// 準備 services 資料
const servicesInfo: ServiceInfo[] = dataStore.services.map((s) => ({
  service_name: s.service_name,
  duration: s.duration,
  buffer_time: s.buffer_time,
  intensity_level: (s as any).intensity_level || "medium",
  transferable: (s as any).transferable || "yes",
}));

// 生成風險報告
const riskReport = generateWorkloadRiskReport(
  dataStore.appointments,
  servicesInfo
);

// 渲染到 UI
renderWorkloadRiskReport(riskReport);
```

## 顯示位置

**人力分析頁** → **AI 人力負荷分析建議** 區塊

## 檔案位置

- 分析邏輯:`src/logic/aiWorkloadRiskAnalyzer.ts`
- 頁面整合:`src/pages/staffPage.ts`
- UI 渲染:`renderWorkloadRiskReport()` 函數

## 注意事項

1. 本分析以**本週 (WTD)** 資料為基礎
2. 優先處理**紅色風險**項目
3. 建議以**角色**而非**姓名**呈現人員資訊
4. 目的是**預防過勞**與**維持品質**,非評比表現
