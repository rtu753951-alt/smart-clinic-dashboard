# 療程風險引擎 - 嚴格規則版本

## 🎯 核心原則

### 可執行判斷（三重檢查）

療程是否可被執行，**僅**依據以下三個條件：

```typescript
eligible_staff = staff.filter(
  (s) =>
    s.status === "active" && // 1. 在職
    s.staff_type === service.executor_role && // 2. 角色相符
    certified_services.includes(service_name) // 3. 具備認證
);
```

### 禁止使用

❌ `specialty` - 不作為可執行判斷依據
❌ `service.category` - 不作為可執行判斷依據
❌ 人力負載百分比 - 不計算個人負載
❌ `Infinity` 或 `0 人` - 除非 eligible_staff 真的為空

## 📊 風險分級規則

### 🔴 高風險（Critical）

| 條件                 | 風險類型                   | 說明                       |
| -------------------- | -------------------------- | -------------------------- |
| `eligible_staff = 0` | 無可執行人力（結構性風險） | 真的沒有符合三重條件的人員 |
| `eligible_staff = 1` | 高度集中風險               | 僅 1 人可執行，無備援      |

### 🟠 中風險（Warning）

| 條件                                 | 風險類型       | 說明                      |
| ------------------------------------ | -------------- | ------------------------- |
| `eligible_staff ≥ 2` 且 `senior = 1` | 技能斷層風險   | 僅 1 位資深人員，缺乏傳承 |
| `eligible_staff ≥ 2` 且 `senior = 0` | 品質穩定性風險 | 無資深人員指導            |

### ✅ 正常（Normal）

| 條件                                              | 狀態     | 說明       |
| ------------------------------------------------- | -------- | ---------- |
| `eligible_staff ≥ 2` 且 `senior ≥ 1` 且 `mid ≥ 1` | 結構健康 | 不產生警告 |

## 📝 輸出格式

### 簡要版（1 行）

```
🔴 Pico Laser 高度集中風險（僅 1 人可執行）
```

### 詳細版

```typescript
{
  type: "service",
  level: "critical",
  icon: "🔴",
  serviceName: "Pico Laser",
  summary: "Pico Laser 高度集中風險（僅 1 人可執行）",
  detail: "Pico Laser 僅由 王美療師（senior）執行，任何請假或異動將直接影響服務",
  reason: "本月預約：450 筆｜符合資格人數：1 人（王美療師）｜技能等級：senior",
  suggestion: "建議緊急培訓至少 1 位備援人員，確保該療程至少有 2 人可執行",
  metadata: {
    eligibleStaffCount: 1,
    skillDistribution: { senior: 1, mid: 0, junior: 0 },
    staffDetails: [
      { name: "王美療師", skillLevel: "senior" }
    ],
    appointmentCount: 450,
    totalMinutes: 18000
  }
}
```

## 🔍 判斷邏輯範例

### 範例 1：Pico Laser

**資料：**

```
service: { service_name: "Pico Laser", executor_role: "therapist" }

staff:
- 王美療師: therapist, senior, certified_services: "Pico Laser|Laser Toning|..."
- 林美療師: therapist, mid, certified_services: "RF Tightening|Hydra Facial|..." (無 Pico Laser)
```

**判斷：**

```
王美療師: ✅ active + therapist + 有 Pico Laser 認證
林美療師: ❌ active + therapist + 無 Pico Laser 認證

eligible_staff = 1
→ 🔴 高度集中風險（僅 1 人可執行）
```

### 範例 2：Thermage

**資料：**

```
service: { service_name: "Thermage", executor_role: "doctor" }

staff:
- 陳醫師: doctor, senior, certified_services: "Botox|Thread Lift|Thermage|..."
- 李醫師: doctor, senior, certified_services: "Botox|Thread Lift|Ultherapy|..." (無 Thermage)
- 吳醫師: doctor, mid, certified_services: "Botox|Skin Booster|..." (無 Thermage)
```

**判斷：**

```
陳醫師: ✅ active + doctor + 有 Thermage 認證
李醫師: ❌ active + doctor + 無 Thermage 認證
吳醫師: ❌ active + doctor + 無 Thermage 認證

eligible_staff = 1
→ 🔴 高度集中風險（僅 1 人可執行）
```

### 範例 3：Botox

**資料：**

```
service: { service_name: "Botox", executor_role: "doctor" }

staff:
- 陳醫師: doctor, senior, certified_services: "Botox|Thread Lift|Thermage|..."
- 李醫師: doctor, senior, certified_services: "Botox|Thread Lift|Ultherapy|..."
- 吳醫師: doctor, mid, certified_services: "Botox|Skin Booster|..."
- 林醫師: doctor, mid, certified_services: "Thermage|RF Tightening|..." (無 Botox)
```

**判斷：**

```
陳醫師: ✅ active + doctor + 有 Botox 認證
李醫師: ✅ active + doctor + 有 Botox 認證
吳醫師: ✅ active + doctor + 有 Botox 認證
林醫師: ❌ active + doctor + 無 Botox 認證

eligible_staff = 3
senior = 2, mid = 1

→ ✅ 結構健康（不產生警告）
```

### 範例 4：RF Tightening

**資料：**

```
service: { service_name: "RF Tightening", executor_role: "therapist" }

staff:
- 王美療師: therapist, senior, certified_services: "Pico Laser|Laser Toning|..." (無 RF Tightening)
- 林美療師: therapist, mid, certified_services: "RF Tightening|Hydra Facial|..."
```

**判斷：**

```
王美療師: ❌ active + therapist + 無 RF Tightening 認證
林美療師: ✅ active + therapist + 有 RF Tightening 認證

eligible_staff = 1
→ 🔴 高度集中風險（僅 1 人可執行）
```

## 🧪 Console Debug 訊息

```
💉 療程風險分析: {
  totalAppointments: 1000,
  serviceCount: 8
}

  Pico Laser: {
    count: 450,
    executorRole: "therapist",
    eligibleStaff: 1,
    skillDistribution: { senior: 1, mid: 0, junior: 0 },
    staffDetails: [
      { name: "王美療師", skillLevel: "senior" }
    ]
  }

  Thermage: {
    count: 120,
    executorRole: "doctor",
    eligibleStaff: 1,
    skillDistribution: { senior: 1, mid: 0, junior: 0 },
    staffDetails: [
      { name: "陳醫師", skillLevel: "senior" }
    ]
  }

  Botox: {
    count: 280,
    executorRole: "doctor",
    eligibleStaff: 3,
    skillDistribution: { senior: 2, mid: 1, junior: 0 },
    staffDetails: [
      { name: "陳醫師", skillLevel: "senior" },
      { name: "李醫師", skillLevel: "senior" },
      { name: "吳醫師", skillLevel: "mid" }
    ]
  }
```

## ✅ 測試方式

1. **重新整理瀏覽器**（Ctrl+Shift+R）
2. **打開 Console**（F12）
3. **查看「💉 療程風險分析」訊息**
4. **確認：**
   - ✅ `eligibleStaff` 數字正確
   - ✅ 只有真正符合三重條件的人員被計入
   - ✅ 無誤判「0 人」的情況
   - ✅ 風險分級合理

## 📋 TODO 清單

如果資料不足，會標註 TODO：

- [ ] TODO: staff.csv 缺少 certified_services 欄位
- [ ] TODO: staff.csv 缺少 skill_level 欄位
- [ ] TODO: staff.csv 缺少 status 欄位

---

_版本：v3.1 (嚴格規則版)_
_最後更新：2025-12-15_
