# Medical Clinic Insight & Compliance Assistant

### 醫美營運洞察與合規檢查儀表板

> [!IMPORTANT]
> **⚠️ 重要聲明**：本系統不提供任何醫療診斷或治療建議，其 AI 分析結果僅供營運效率評估與行銷文案合規參考。

![License](https://img.shields.io/badge/license-Private-red.svg)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/AI-Active-green.svg)

**這是一個結合 AI 行銷合規檢查與大數據分析的經營管理系統，旨在協助醫美診所經營者監控潛在合規風險並優化營運績效。**

系統核心採用 Google Gemini API 與現代化前端視覺化技術，能即時分析大量預約與營收數據，並針對行銷文案與經營策略提供具備「專業／友善幽默」雙重語氣的 AI 營運洞察摘要。

---

## ✨ Key Features (核心功能亮點)

### 🤖 1. AI 行銷合規檢查 (AI Compliance Audit)

- **顧問式語氣建議**：提供具備「友善幽默」的親切建議。不再是冷冰冰的法規條文，而是像資深顧問般的貼心（與輕鬆易懂）提醒。
- **雙重語氣切換**：系統支援在「專業嚴謹」與「友善幽默」兩種模式間切換，讓合規檢查過程兼具精準度與互動體驗。

### 🚨 2. AI 營運預警 (AI Operational Alert) **[NEW]**

> 「此功能為規則／資料交叉比對（Rule-based），不依賴生成式模型，亦不消耗 AI token。」
> 輸出為「缺口項目清單（服務項目 × 缺少認證職類/人員）」與建議處置（調度/訓練/暫停上架）。

- **人力與服務交叉比對**：系統具備智慧掃描引擎，能自動交叉比對 `services.csv` (服務項目價目表) 與 `staff.csv` (人員技能認證)。
- **執行人力缺口偵測**：主動識別營運風險。例如：當診所新增高單價項目（如：微晶磨皮），但系統偵測到現有人員中無人具備該項目的操作認證時，將自動發出預警，協助管理層即時安排培訓，避免合規風險。

### 📉 3. 動態風險預警系統 (Dynamic Risk Alert)

- **視覺化分級提示**：根據 AI 檢查結果自動切換 UI 風險等級：
  - **🔴 高風險**：介面以 **紅框高亮顯示**，並標註 ⚠️ 警告圖標。詳細顯示違規原因與 **修正建議方向**。
  - **🟡 中風險**：提示需優化之辭彙，並提供具體的替代表述建議。
  - **🟢 低風險**：顯示綠燈提示，代表文案無明顯違規疑慮。
- **API 冷卻與防護**：內建智慧冷卻 UI，確保在請求頻繁時維持系統穩定。

### 📊 4. 萬筆級數據極速處理 (Big Data Insights)

- **高效能解析架構**：採用優化的 Data Store 架構，能穩定載入並解析包含 **55,000+** 筆經營數據的通用格式 CSV。
- **前端邊緣運算**：在瀏覽器端即可完成複雜的交叉分析（醫師工時、到診率、主力療程營收分析），無需依賴龐大後端伺服器，保障資料隱私。

---

## 🔒 Security & Privacy (資安與隱私)

### 資安架構：BYOK (Bring Your Own Key)

本專案採用 **BYOK** 模式設計，確保您的 API 金鑰完全掌握在自己手中。

1. **本地執行**：本專案**不會**將您的 API Key 上傳或保存於「開發者自建伺服器」。金鑰僅於瀏覽器端本地保存 (`localStorage`)，並用於呼叫 Google 官方 API（可於 DevTools 檢視網路請求）。
2. **環境隔離**：開發配置嚴格遵守 `.gitignore` 規範，確保敏感資訊不外流。
3. **建議措施**：建議於 Google AI Studio 對 API Key 設定 `HTTP Referrer` 網域限制，進一步降低被濫用風險。

### 🛡️ 資料隱私規範

- **僅限模擬數據**：Repo 內附帶的數據均為生成的**虛擬模擬資料**。
- **嚴禁上傳真實個資**：使用者**嚴禁**將真實患者的個資 (PII) 或敏感醫療紀錄上傳至本 Repository。

---

## 🚀 Setup (安裝與設定)

### 1. 安裝與啟動

```bash
npm install
npm run dev
```

### 2. 設定 AI 金鑰 (必要)

1. 前往 Google AI Studio 申請 API Key。
2. 點擊系統介面中的 「⚙️ 系統設定」。
3. 在欄位中貼上金鑰並儲存，系統會自動進行連線測試。

---

## 🧪 快速測試與假資料生成 (Quick Test & Mock Data Generation)

為了方便快速測試系統的「萬用大表匯入」與「大數據分析」功能，建議使用以下 Python 腳本生成符合規格的模擬資料（建議於 Google Colab 執行）：

1. **複製腳本**：使用 Python 生成 100 筆隨機預約資料，欄位完全符合本系統之 `universal_master_template.csv` 規格。
   - **範本取得**：`universal_master_template.csv` 可直接於系統 **「⚙️ 系統設定 > 下載範本」** 處下載。
2. **生成檔案**：執行後下載 `mock_clinic_data.csv`。
3. **匯入測試**：在系統介面點擊 「匯入 CSV」，即可看到醫師產能圖表與營運數據即時更新。

### ⚙️ 系統容錯與資料魯棒性 (Data Robustness)

本系統內建智慧容錯機制，即使 CSV 資料不完整也能穩定運作：

- **Doctor Name (未指定)**：若欄位空白，系統將自動歸類為「未指定」。
- **Status (自動補全)**：若狀態不明，預設以 `completed` 進行「示範性」估算（建議補齊 status 以確保精準）。
- **金額計算**：優先讀取 `purchased_amount`；若為空，則查找內建價目表 (`services.csv`) 進行估算。

### 關鍵欄位說明

- **status**: 包含 到診 (`completed`)、取消 (`cancelled`)、未到 (`no_show`)。
- **purchased_amount**: 數值型態；此欄位金額權重 **高於** 系統預設之療程定價。
- **case_flag / focus_override**: 用於標註 VIP 顧客或 AI 重點監控對象。

```python
import pandas as pd
import random
from datetime import datetime, timedelta

# 1. 定義標準 16 欄位 (符合 System Universal Template)
# 注意：本系統營收計算優先權重為: purchased_amount > service catalog price
headers = [
    'appointment_id', 'date', 'customer_id', 'gender', 'age', 'is_new',
    'service_item', 'purchased_amount', 'doctor_name', 'staff_name',
    'status', 'room', 'equipment', 'remaining_sessions', 'case_flag', 'focus_override'
]

# 2. 定義隨機資料池
doctors = ['Dr. Chen', 'Dr. Wu', 'Dr. Lee', 'Dr. Chang', 'Dr. Strange']
staffs = ['Nurse Lin', 'Nurse Wang', 'Therapist Amy', 'Therapist Eva']
services = [
    ('PicoSure', 8000), ('Thermage', 60000), ('Botox', 4500),
    ('Ulthera', 55000), ('HydraFacial', 3000)
]
statuses = ['completed', 'completed', 'completed', 'cancelled', 'no_show'] # 加權 completed

# 3. 生成 100 筆模擬資料
data = []
start_date = datetime.now().replace(day=1) # 本月 1 號

for i in range(1, 101):
    svc, base_price = random.choice(services)

    # 隨機波動價格 (90% ~ 110%)
    real_price = int(base_price * random.uniform(0.9, 1.1))

    row = {
        'appointment_id': f'MOCK-{i:03d}',
        'date': (start_date + timedelta(days=random.randint(0, 20))).strftime('%Y-%m-%d'),
        'customer_id': f'CUS-{random.randint(100, 150):03d}',
        'gender': random.choice(['female', 'female', 'male']),
        'age': random.randint(20, 60),
        'is_new': random.choice(['yes', 'no', 'no']),
        'service_item': svc,
        'purchased_amount': real_price, # 關鍵欄位 for Revenue
        'doctor_name': random.choice(doctors),
        'staff_name': random.choice(staffs),
        'status': random.choice(statuses),
        'room': f'R{random.randint(1,5):02d}',
        'equipment': 'Standard-Device',
        'remaining_sessions': random.randint(0, 10),
        'case_flag': random.choice(['none', 'none', 'vip', 'risk']),
        'focus_override': 'none'
    }
    # 確保順序
    data.append([row[col] for col in headers])

# 4. 建立 DataFrame 並存檔
df = pd.DataFrame(data, columns=headers)
filename = 'mock_clinic_data.csv'
df.to_csv(filename, index=False, encoding='utf-8-sig') # BOM for Excel friendliness

print(f"✅ 已生成 {len(df)} 筆模擬資料，請下載 {filename} 並匯入系統測試。")
```

---

## 🔧 Technologies

- **Frontend**: TypeScript, Vite, Vanilla JS (ES Modules)
- **AI Engine**: Google AI Studio (Gemini) via models.list dynamic selection (Default: Flash / Flash-Lite; Optional: Pro)
- **Data Processing**: PapaParse (CSV Parsing)
- **Charts**: Chart.js & Matrix Plugin

---

## License

This project is licensed under **CC BY-NC 4.0**.

- Learning and non-commercial use is welcome.
- Commercial use or redistribution as a product is not allowed without permission.
  
---

© 2026 Smart Clinic Dashboard. All Rights Reserved.
