// =====================================================
// 營運概要指標卡 - 核心函數摘要
// =====================================================

/* 
 * 檔案：src/pages/overviewPage.ts
 * 新增函數：updateRevenueStatus() 和 updateReturnVisitRate()
 */

// ===================== 1. 營收狀態卡 =====================

/**
 * 計算並顯示今日營收狀態
 * 
 * 功能：
 * - 計算今日、昨日、過去 7 天平均營收
 * - 比較今日 vs 昨日、今日 vs 7 日平均
 * - 判斷狀態：高於預期 / 符合預期 / 低於預期
 * 
 * 資料來源：
 * - dataStore.appointments (status === "completed")
 * - dataStore.services (price)
 * 
 * 不顯示：
 * - ❌ 實際金額
 * - ❌ 客戶名單
 * - ❌ 詳細交易記錄
 * 
 * 只顯示：
 * - ✅ 趨勢方向（高於/符合/低於）
 * - ✅ 百分比變化
 */
function updateRevenueStatus() {
    // 1. 計算日期範圍
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterdayStr = /* 昨天日期 */;
    const past7Days = /* 過去 7 天日期陣列 */;
    
    // 2. 計算營收（輔助函數）
    const calcRevenue = (dateList: string[]): number => {
        return dataStore.appointments
            .filter(apt => 
                apt.status === "completed" && 
                dateList.includes(apt.date) &&
                apt.service_item
            )
            .reduce((sum, apt) => {
                const service = dataStore.services.find(
                    s => s.service_name === apt.service_item
                );
                return sum + (service?.price || 0);
            }, 0);
    };
    
    // 3. 計算各時段營收
    const todayRevenue = calcRevenue([todayStr]);
    const yesterdayRevenue = calcRevenue([yesterdayStr]);
    const avg7Days = calcRevenue(past7Days) / 7;
    
    // 4. 計算變化百分比
    const vsYesterday = Math.round(
        ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
    );
    const vs7DaysAvg = Math.round(
        ((todayRevenue - avg7Days) / avg7Days) * 100
    );
    
    // 5. 判斷狀態
    let status = "符合預期";
    let statusColor = "#06b6d4"; // cyan
    
    if (vs7DaysAvg > 10) {
        status = "高於預期";
        statusColor = "#10b981"; // green
    } else if (vs7DaysAvg < -10) {
        status = "低於預期";
        statusColor = "#f59e0b"; // amber
    }
    
    // 6. 更新 UI
    const html = `
        <div>今日營收狀態: ${status}</div>
        <div>vs 昨日: ${vsYesterday >= 0 ? '+' : ''}${vsYesterday}%</div>
        <div>vs 近 7 日平均: ${vs7DaysAvg >= 0 ? '+' : ''}${vs7DaysAvg}%</div>
    `;
    
    document.getElementById("revenue-status-content").innerHTML = html;
}

// ===================== 2. 回診率卡 =====================

/**
 * 計算並顯示本月顧客回診率
 * 
 * 功能：
 * - 統計本月有完成預約的客戶
 * - 計算回診客數量（≥2 次預約）
 * - 計算回診率百分比
 * - 判斷顧客黏著度狀態
 * 
 * 資料來源：
 * - dataStore.appointments (status === "completed")
 * 
 * 不顯示：
 * - ❌ 客戶姓名
 * - ❌ 客戶列表
 * - ❌ 個別預約記錄
 * 
 * 只顯示：
 * - ✅ 回診率百分比
 * - ✅ 狀態（穩定/普通/偏低）
 * - ✅ 統計數字（回診客數 / 總客數）
 */
function updateReturnVisitRate() {
    // 1. 取得當前月份
    const currentMonth = (window as any).currentDashboardMonth 
        || new Date().toISOString().slice(0, 7);
    
    // 2. 篩選本月 completed 預約
    const monthAppointments = dataStore.appointments.filter(apt => 
        apt.status === "completed" && 
        apt.date.startsWith(currentMonth)
    );
    
    // 3. 統計每個客戶的預約次數
    const customerVisitCount = new Map<string, number>();
    monthAppointments.forEach(apt => {
        if (apt.customer_id) {
            const count = customerVisitCount.get(apt.customer_id) || 0;
            customerVisitCount.set(apt.customer_id, count + 1);
        }
    });
    
    // 4. 計算回診客數量（≥2 次預約）
    let returnCustomers = 0;
    customerVisitCount.forEach(count => {
        if (count >= 2) {
            returnCustomers++;
        }
    });
    
    // 5. 計算回診率
    const totalCustomers = customerVisitCount.size;
    const returnRate = totalCustomers > 0 
        ? Math.round((returnCustomers / totalCustomers) * 100)
        : 0;
    
    // 6. 判斷狀態
    let statusText = "穩定";
    let statusColor = "#10b981"; // green
    
    if (returnRate < 30) {
        statusText = "偏低";
        statusColor = "#ef4444"; // red
    } else if (returnRate < 45) {
        statusText = "普通";
        statusColor = "#f59e0b"; // amber
    }
    
    // 7. 更新 UI
    const html = `
        <div>本月回診率: ${returnRate}%</div>
        <div>進度條: [視覺化]</div>
        <div>顧客黏著度: ${statusText}</div>
        <div>${returnCustomers} / ${totalCustomers} 位顧客回診</div>
    `;
    
    document.getElementById("return-visit-content").innerHTML = html;
}

// ===================== 3. 初始化整合 =====================

/**
 * 營運概要頁面初始化
 * 
 * 修改：在既有函數呼叫中新增兩個新函數
 */
export function initOverviewPage() {
    console.log("initOverviewPage (new modal system)");

    if (!dataStore.appointments.length) {
        console.warn("Appointments not loaded yet.");
        return;
    }

    updateTodayKPI();              // 既有
    updateDoctorTop3();            // 既有
    updateTreatmentTop3();         // 既有
    updateRoomAndEquipmentUsage(); // 既有
    updateRevenueStatus();         // ✨ 新增：營收狀態卡
    updateReturnVisitRate();       // ✨ 新增：回診率卡
    updateAISummaryBlocks();       // 既有
    bindOverviewCards();           // 既有
}

// =====================================================
// HTML 結構（index.html）
// =====================================================

/*
<!-- 中層：營運指標區（營收狀態 + 回診率） -->
<div class="overview-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-bottom: 1.5rem;">
  
  <!-- 💰 今日營收狀態 -->
  <article class="overview-card">
    <header>
      <h3>💰 今日營收狀態</h3>
      <small>* 僅顯示趨勢，不含金額明細</small>
    </header>
    <div class="card-body" id="revenue-status-content">
      <!-- 動態生成 -->
    </div>
  </article>

  <!-- 🔄 本月顧客回診率 -->
  <article class="overview-card">
    <header>
      <h3>🔄 本月顧客回診率</h3>
      <small>* 反映顧客黏著度</small>
    </header>
    <div class="card-body" id="return-visit-content">
      <!-- 動態生成 -->
    </div>
  </article>

</div>
*/

// =====================================================
// 關鍵設計決策
// =====================================================

/*
1. ✅ 不新增資料表
   - 僅使用既有 appointments、services、customers

2. ✅ 不改動既有卡片
   - 所有既有函數保持不變
   - 新函數獨立運作

3. ✅ 只做補充型指標
   - 不影響其他頁面
   - 不破壞既有邏輯

4. ✅ 不顯示金額明細
   - 營收卡只顯示趨勢與比率
   - 無貨幣符號強調

5. ✅ 不顯示客戶列表
   - 回診率卡只顯示統計數字
   - 保護隱私

6. ✅ 支援月份切換
   - 使用 currentDashboardMonth 全域變數
   - 自動重新計算

7. ✅ 樣式一致性
   - 使用既有 CSS 變數
   - 與其他 KPI 卡風格統一
*/

// =====================================================
// 測試檢查清單
// =====================================================

/*
□ 頁面載入後兩張新卡片正常顯示
□ 營收狀態卡顯示正確的狀態與百分比
□ 回診率卡顯示正確的百分比與進度條
□ 切換月份選擇器時回診率會更新
□ 沒有破壞既有卡片的功能
□ 沒有顯示金額或客戶名單
□ 樣式與既有卡片一致
□ Console 沒有錯誤訊息
*/
