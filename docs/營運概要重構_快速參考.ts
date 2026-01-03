// =====================================================
// 營運概要頁面重構 - 快速參考卡
// =====================================================

/* 
 * 📋 重構目標
 * 將營運概要頁面從混亂的單層結構重構為清晰的四層語意結構
 */

// =====================================================
// 四層結構概覽
// =====================================================

/*
1️⃣ 即時營運 KPI（Section 1）
   - 位置：頁面最上方
   - 樣式：kpi-strip + kpi-card
   - 內容：今日預約、到診率、醫師出勤、護理/美療、診間使用率、設備使用率
   - 修改：無（維持原樣）

2️⃣ 經營成效摘要（Section 2）⭐ 新增
   - 位置：KPI 下方，獨立區塊
   - 樣式：business-summary-section + metric-card
   - 內容：今日營收狀態、本月營收、本月回診率
   - 修改：新增區塊、新增本月營收函數

3️⃣ 營運分佈分析（Section 3）
   - 位置：經營成效摘要下方
   - 樣式：operations-analysis-section + overview-card
   - 內容：醫師 Top3、療程 Top3、診間使用率、設備使用率
   - 修改：加上區塊標題

4️⃣ AI 洞察分析（Section 4）
   - 位置：頁面最下方
   - 樣式：ai-insights-section + ai-overview-zone
   - 內容：AI 風險預警、AI 趨勢摘要
   - 修改：加上區塊標題
*/

// =====================================================
// 新增的 CSS Class
// =====================================================

/*
.business-summary-section     // 經營成效摘要區塊容器
.business-metrics-grid         // 經營指標卡片網格
.metric-card                   // 經營指標卡片
.metric-header                 // 卡片頭部（圖標 + 標題）
.metric-icon                   // 漸層圖標
.metric-title-group            // 標題組（中文 + 英文）
.metric-body                   // 卡片內容區
.operations-analysis-section   // 營運分佈分析區塊
.ai-insights-section           // AI 洞察區塊
.section-header                // 區塊標題容器
.section-title                 // 區塊標題文字
*/

// =====================================================
// 新增的函數
// =====================================================

/**
 * updateMonthlyRevenue()
 * 
 * 功能：計算並顯示本月營收總額
 * 
 * 資料來源：
 * - dataStore.appointments (status === "completed")
 * - dataStore.services (price)
 * 
 * 顯示內容：
 * - 本月累計營收（格式化數字，無貨幣符號）
 * - 完成預約數
 * 
 * 不顯示：
 * - ❌ 每日明細
 * - ❌ 客戶列表
 * - ❌ 療程分類
 */
function updateMonthlyRevenue() {
    // 1. 取得當前月份
    const currentMonth = (window as any).currentDashboardMonth 
        || new Date().toISOString().slice(0, 7);
    
    // 2. 篩選本月 completed 預約
    const monthAppointments = dataStore.appointments.filter(apt => 
        apt.status === "completed" && 
        apt.date.startsWith(currentMonth) &&
        apt.service_item
    );
    
    // 3. 計算總營收
    const totalRevenue = monthAppointments.reduce((sum, apt) => {
        const service = dataStore.services.find(
            s => s.service_name === apt.service_item
        );
        return sum + (service?.price || 0);
    }, 0);
    
    // 4. 格式化數字（千分位逗號，無貨幣符號）
    const formattedRevenue = totalRevenue.toLocaleString('zh-TW', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
    
    // 5. 更新 UI
    // 顯示：總額 + 完成預約數
}

// =====================================================
// 函數呼叫順序（initOverviewPage）
// =====================================================

/*
// Section 1: Real-time Operations KPI
updateTodayKPI();

// Section 2: Business Performance Summary
updateRevenueStatus();      // 今日營收狀態
updateMonthlyRevenue();     // 本月營收 ⭐ 新增
updateReturnVisitRate();    // 本月回診率

// Section 3: Operations Distribution Analysis
updateDoctorTop3();
updateTreatmentTop3();
updateRoomAndEquipmentUsage();

// Section 4: AI Insights
updateAISummaryBlocks();

// Bind modal interactions
bindOverviewCards();
*/

// =====================================================
// HTML 結構範例
// =====================================================

/*
<section class="overview-dashboard">
  
  <!-- Section 2: Business Performance Summary -->
  <div class="business-summary-section">
    <div class="section-header">
      <h2 class="section-title">
        <i class="fa-solid fa-chart-line"></i>
        經營成效摘要
      </h2>
      <small>Business Performance Summary</small>
    </div>
    
    <div class="business-metrics-grid">
      
      <!-- 💰 Today's Revenue Status -->
      <article class="metric-card">
        <div class="metric-header">
          <div class="metric-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <i class="fa-solid fa-dollar-sign"></i>
          </div>
          <div class="metric-title-group">
            <h3>今日營收狀態</h3>
            <small>Today's Revenue</small>
          </div>
        </div>
        <div class="metric-body" id="revenue-status-content">
          <!-- Dynamically generated -->
        </div>
      </article>
      
      <!-- 📊 Monthly Revenue Total -->
      <article class="metric-card">
        <div class="metric-header">
          <div class="metric-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
            <i class="fa-solid fa-wallet"></i>
          </div>
          <div class="metric-title-group">
            <h3>本月營收</h3>
            <small>Monthly Revenue</small>
          </div>
        </div>
        <div class="metric-body" id="monthly-revenue-content">
          <!-- Dynamically generated -->
        </div>
      </article>
      
      <!-- 🔄 Monthly Return Visit Rate -->
      <article class="metric-card">
        <div class="metric-header">
          <div class="metric-icon" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
            <i class="fa-solid fa-rotate"></i>
          </div>
          <div class="metric-title-group">
            <h3>本月顧客回診率</h3>
            <small>Return Visit Rate</small>
          </div>
        </div>
        <div class="metric-body" id="return-visit-content">
          <!-- Dynamically generated -->
        </div>
      </article>
      
    </div>
  </div>
  
  <!-- Section 3: Operations Distribution Analysis -->
  <div class="operations-analysis-section">
    <div class="section-header">
      <h2 class="section-title">
        <i class="fa-solid fa-chart-pie"></i>
        營運分佈分析
      </h2>
      <small>Operations Distribution</small>
    </div>
    
    <div class="overview-grid overview-main-grid">
      <!-- 4 張卡片：醫師、療程、診間、設備 -->
    </div>
  </div>
  
  <!-- Section 4: AI Insights Zone -->
  <div class="ai-insights-section">
    <div class="section-header">
      <h2 class="section-title">
        <i class="fa-solid fa-brain"></i>
        AI 洞察分析
      </h2>
      <small>AI Insights</small>
    </div>
    
    <div class="ai-overview-zone">
      <!-- 2 張 AI 卡片 -->
    </div>
  </div>
  
</section>
*/

// =====================================================
// 關鍵設計決策
// =====================================================

/*
✅ 只修改 UI 結構，不修改計算邏輯
✅ 經營成效摘要使用獨立背景色，提升視覺權重
✅ 每個區塊加上清晰的標題和英文副標題
✅ Metric cards 使用漸層圖標，增強視覺吸引力
✅ 保持既有的 Modal 彈窗功能
✅ 支援響應式布局（桌面、平板、手機）

❌ 不新增資料表
❌ 不修改既有計算邏輯
❌ 不破壞既有功能
❌ 不顯示金額明細或客戶列表
*/

// =====================================================
// 測試檢查清單
// =====================================================

/*
功能測試：
□ 四個區塊正常顯示
□ 今日營收狀態正常計算
□ 本月營收正常計算（總額 + 完成預約數）
□ 本月回診率正常計算
□ 醫師/療程 Top3 正常顯示
□ 診間/設備使用率正常顯示
□ AI 風險預警/趨勢摘要正常顯示
□ 切換月份時，本月營收和回診率會更新

樣式測試：
□ 經營成效摘要有獨立背景色
□ Metric cards 有圖標和漸層色
□ Section headers 清晰可見
□ 響應式布局正常
□ Hover 效果正常

邏輯測試：
□ 所有既有計算邏輯未被修改
□ Modal 彈窗功能正常
□ Console 沒有錯誤
*/

// =====================================================
// 色彩語意
// =====================================================

/*
💰 今日營收狀態：綠色漸層 (#10b981 → #059669)
   → 成長、正向、健康

📊 本月營收：藍色漸層 (#3b82f6 → #2563eb)
   → 穩定、專業、可靠

🔄 本月回診率：紫色漸層 (#8b5cf6 → #7c3aed)
   → 黏著度、忠誠度、長期價值
*/

// =====================================================
// 檔案清單
// =====================================================

/*
修改的檔案：
✅ index.html（第 160-340 行）
✅ src/pages/overviewPage.ts（新增函數、調整順序）
✅ style.css（新增約 180 行樣式）
✅ dist/pages/overviewPage.js（編譯後）

新增的檔案：
✅ docs/營運概要頁面重構說明.md
✅ docs/營運概要重構_快速參考.ts（本檔案）
*/
