// ✅ 只需要這兩個 import
import { AppointmentRecord, CustomerRecord } from "../data/schema";
import { calculateTrends, TrendResult } from "./trendEngine.js";
import { dataStore } from "../data/dataStore.js";
import { sandboxStore } from "../features/sandbox/sandboxStore.js";

// ⛔ 這種千萬不要留在 aiManager.ts 裡：
// import { AIReportInput, AIReportOutput } from "../logic/aiManager";


// === AI Report Types ===
export interface AIReportInput {
  todayTotal: number;
  todayShow: number;
  showRate: number;
  doctorTop3: { doctor: string; count: number }[];
  treatmentTop3: { name: string; count: number }[];
}

export interface AIReportOutput {
  summary: string;
  kpi_insights: string[];
  alerts: string[];
  actions: string[];
  doctorTop3: { doctor: string; count: number }[];
  treatmentTop3: { name: string; count: number }[];
  todayTotal: number;
  todayShow: number;
  showRate: number;
  trendSummary: string;
}

export function updateServiceAISummary(text: string | null) {
    // [Fix] Changed ID to avoid conflict with Overview AI Trend Modal (ai-full-report)
    const box = document.getElementById("service-ai-summary-text"); 
    if (!box) return;
    box.textContent = text;
}



// === Main AI function ===
export function generateAIReport(data: { todayTotal: any; todayShow: any; showRate: any; doctorTop3: any; treatmentTop3: any; }, appointments: string | any[]) {
    const { todayTotal, todayShow, showRate, doctorTop3, treatmentTop3 } = data;

    // ---- 安全處理 Top3 ----
    const topDoctor = doctorTop3?.[0] ?? null;
    const topTreatment = treatmentTop3?.[0] ?? null;

    const totalDoctorTop3Count = doctorTop3?.reduce((sum: any, d: { count: any; }) => sum + (d.count || 0), 0) || 0;
    const topDoctorShare =
        totalDoctorTop3Count === 0 || !topDoctor
            ? 0
            : Math.round((topDoctor.count / totalDoctorTop3Count) * 100);

    const totalTreatmentTop3Count = treatmentTop3?.reduce((sum: any, t: { count: any; }) => sum + (t.count || 0), 0) || 0;
    const topTreatmentShare =
        totalTreatmentTop3Count === 0 || !topTreatment
            ? 0
            : Math.round((topTreatment.count / totalTreatmentTop3Count) * 100);

    // ---- 趨勢安全處理（appointments 可能為空）----
    let trend: any = {
    diffDay: 0,
    diffWeek: 0,
    topTreatmentTrend: [],
    topDoctorTrend: []
     };


    try {
        if (appointments && appointments.length > 0) {
            trend = calculateTrends(appointments as AppointmentRecord[]);
        }
    } catch (err) {
        console.warn("Trend calculation skipped due to error:", err);
    }

    // ---- Summary ----
    let summary = "";
    const noShow = Math.max(todayTotal - todayShow, 0);

    if (todayTotal === 0) {
        summary = "今日沒有任何預約紀錄，可利用空檔進行內訓或規劃促案。";
    } else {
        summary =
            `今日共有 ${todayTotal} 筆預約，其中 ${todayShow} 筆已完成，到診率 ${showRate}%。` +
            (noShow > 0 ? ` 未到診 ${noShow} 件，建議追蹤原因。` : "");

        if (topDoctor) {
            summary += ` 今日預約最多的醫師為「${topDoctor.doctor}」，占 Top3 的 ${topDoctorShare}%。`;
        }
        if (topTreatment) {
            summary += ` 最熱門療程為「${topTreatment.name}」，占 Top3 的 ${topTreatmentShare}%。`;
        }
    }

    // ---- KPI insights ----
    const kpi_insights = [
        `今日預約 ${todayTotal} 件，到診 ${todayShow} 件，未到診 ${noShow} 件。`,
        `到診率 ${showRate}%。`
    ];

    if (topDoctor) {
        kpi_insights.push(`最熱門醫師：${topDoctor.doctor}（${topDoctor.count} 件）。`);
    }
    if (topTreatment) {
        kpi_insights.push(`最熱門療程：${topTreatment.name}（${topTreatment.count} 件）。`);
    }

    // ---- Alerts ----
    const alerts = [];

    if (todayTotal === 0) alerts.push("⚠ 今日無預約，請確認是否為排程空檔或資料異常。");
    if (todayTotal > 0 && showRate < 50) alerts.push("⚠ 到診率低於 50%，建議加強提醒流程。");
    if (topDoctorShare >= 60) alerts.push(`⚠ 醫師「${topDoctor?.doctor}」預約占比過高，需注意排程負荷。`);
    if (topTreatmentShare >= 60) alerts.push(`⚠ 療程「${topTreatment?.name}」占比過高，可能有結構風險。`);

    // ---- Actions ----
    const actions = [];

    if (todayTotal === 0) {
        actions.push(
            "可安排內訓或規劃促案活動。",
            "檢查未來一週是否有明顯低谷，可提前釋出促銷時段。"
        );
    } else {
        if (showRate < 70) {
            actions.push("建議針對明日預約啟動加強提醒（簡訊/LINE）。");
        }
        if (topTreatmentShare >= 50) {
            actions.push(`檢查「${topTreatment.name}」的庫存與排程，避免供應不足。`);
        }
        actions.push("依據熱門療程規劃下週社群主題。");
    }

    // ---- Trend Summary（安全版）----
    const trendSummary = `
📈 預約趨勢：今日較昨日 ${trend.diffDay >= 0 ? "增加" : "減少"} ${Math.abs(trend.diffDay)} 人。
📅 週趨勢：本週較上週 ${trend.diffWeek >= 0 ? "增加" : "下降"} ${Math.abs(trend.diffWeek)} 人。

🔥 熱門療程變化：
${trend.topTreatmentTrend.map((t: { name: any; today: any; diff: any; }) => `・${t.name}：今日 ${t.today} 件，與昨日差異 ${t.diff}`).join("\n")}

🩺 醫師預約變化：
${trend.topDoctorTrend.map((d: { name: any; today: any; diff: any; }) => `・${d.name}：今日 ${d.today} 件，與昨日差異 ${d.diff}`).join("\n")}
`;

    return {
        summary,
        kpi_insights,
        alerts,
        actions,
        doctorTop3,
        treatmentTop3,
        todayTotal,
        todayShow,
        showRate,
        trendSummary
    };
}

// AI 建議：預約行為分析（Appointments 專用）

export function generateAppointmentSuggestions(appointments: AppointmentRecord[]) {

  /** 取得目前 Dashboard 月份，例如 "2026-01" */
  const month = (window as any).currentDashboardMonth;
  
  // 若無月份資訊，預設使用當前月份
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  /** 篩選本月資料 */
  const monthData = appointments.filter(a => a.date.slice(0, 7) === targetMonth);

  if (monthData.length === 0) {
    return ["本月沒有預約紀錄，可進行行銷推廣或回訪休眠客戶。"];
  }

  // --------------------------------------------------
  // 1️⃣ No-show 分析 (僅針對過去與今日)
  // --------------------------------------------------
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastData = monthData.filter(a => a.date <= todayStr);
  
  let show = 0;
  let noShow = 0;
  let newCustomerNoShow = 0;
  let newCustomerTotal = 0;

  pastData.forEach(a => {
    // 排除已取消 (Cancelled 不算 No-show)
    if (a.status === 'cancelled') return;

    // 計算總體
    if (a.status === 'completed') {
      show++;
    } else if (a.status === 'no_show') {
      noShow++;
    }

    // 計算新客
    if (a.is_new === 'yes') {
        // 僅計算 completed 或 no_show (排除 cancelled)
        if (a.status === 'completed' || a.status === 'no_show') {
            newCustomerTotal++;
            if (a.status === 'no_show') newCustomerNoShow++;
        }
    }
  });

  const totalEffective = show + noShow;
  const noShowRate = totalEffective === 0 ? 0 : Math.round((noShow / totalEffective) * 100);
  const newCustomerNoShowRate = newCustomerTotal === 0 ? 0 : Math.round((newCustomerNoShow / newCustomerTotal) * 100);

  // --------------------------------------------------
  // 2️⃣ 時段與熱點分析 (Align with Chart: Today's Hourly Peak)
  // --------------------------------------------------
  // 為了與「預約時段分布圖」一致，這裡改為分析「今日」的每小時狀況
  const hourlyCounts: Record<number, number> = {};
  
  // 初始化 12:00 - 20:00
  for (let h = 12; h <= 20; h++) hourlyCounts[h] = 0;

  // 使用 appointments (完整資料) 篩選出今日
  // todayStr 已在上方 (line 180) 定義
  appointments.forEach(a => {
      // 排除無效
      if (a.status === 'cancelled') return;
      
      // 確保是今日
      // a.date format YYYY-MM-DD
      if (a.date !== todayStr) return;

      const hour = parseInt(a.time.split(":")[0], 10);
      if (hour >= 12 && hour <= 20) {
          hourlyCounts[hour]++;
      }
  });

  // Find Peak
  let maxVal = 0;
  let peakHour = -1;
  
  Object.entries(hourlyCounts).forEach(([h, count]) => {
      if (count > maxVal) {
          maxVal = count;
          peakHour = parseInt(h, 10);
      }
  });

  // Find Runner-up (Next highest distinct value)
  let runnerUpVal = 0;
  let runnerUpHour = -1;
  
  if (maxVal >= 3) {
      Object.entries(hourlyCounts).forEach(([h, count]) => {
          const hour = parseInt(h, 10);
          if (count < maxVal && count > runnerUpVal) {
              runnerUpVal = count;
              runnerUpHour = hour;
          }
      });
  }

  // --------------------------------------------------
  // 3️⃣ 熱門療程與醫師分析
  // --------------------------------------------------
  const serviceCount: Record<string, number> = {};
  appointments.forEach(a => { // Keep analyzing full dataset for Service Trends (Broader context is fine for Services)
    if (a.status === 'cancelled') return;
    const s = a.service_item?.trim() || "未分類";
    serviceCount[s] = (serviceCount[s] || 0) + 1;
  });

  // --------------------------------------------------
  // 4️⃣ 開始產生 AI 建議文字
  // --------------------------------------------------
  const suggestions: string[] = [];

  // 🎯 優先規則：No-show 警示
  if (totalEffective > 0) {
      if (noShowRate > 20) {
          suggestions.push(`⚠️ No-show 達 ${noShowRate}%：請檢查自動提醒系統。`);
      } else if (noShowRate > 10) {
          suggestions.push(`ℹ️ No-show ${noShowRate}% 略高：建議增加初診電訪。`);
      }
  }

  // 🎯 時段建議 (Today's Peak) - 合併為單條簡潔建議
  if (maxVal >= 3 && peakHour !== -1) {
      let msg = `🔥 今日高峰 ${peakHour}:00 (${maxVal}人)`;
      if (runnerUpVal >= 3 && runnerUpHour !== -1) {
          msg += `、次高 ${runnerUpHour}:00 (${runnerUpVal}人)，請注意分流與人力調度。`;
      } else {
          msg += `，請留意該時段人力支援。`; // Only peak
      }
      suggestions.push(msg);
  } else {
      suggestions.push("✅ 今日預約量平穩，無顯著尖峰時段。");
  }

  // 🎯 離峰建議 (如果今日真的很閒)
  if (maxVal < 3 && totalEffective > 0) {
      suggestions.push("💡 今日整體來客較少，建議加強社群互動或整理病歷。");
  }

  // 🎯 療程建議
  const popular = Object.entries(serviceCount).sort((a, b) => b[1] - a[1])[0];
  if (popular && popular[1] > 0) {
      // 隨機變換句型增加豐富度
      const phrases = [
          `🔥 「${popular[0]}」詢問高：建議加強社群推廣。`,
          `🌟 「${popular[0]}」熱門：可設計組合療程提單價。`
      ];
      suggestions.push(phrases[Math.floor(Math.random() * phrases.length)]);
  }

  return suggestions;
}
// AI 建議：療程與營收分析（Services 專用）
export function generateServiceSuggestions(data: any): string {
  const { mom, categoryRevenue, serviceRevenue, hasFutureContribution } = data;

  const totalRev = Object.values(categoryRevenue).reduce((a: any, b: any) => a + b, 0) as number;
  
  // 1. Analyze Category Concentration
  const categories = Object.entries(categoryRevenue).sort((a: any, b: any) => b[1] - a[1]);
  const topCat: any = categories[0];
  const topCatShare = totalRev > 0 ? (topCat[1] / totalRev) : 0;

  // 2. Analyze Service Concentration
  const services = Object.entries(serviceRevenue).sort((a: any, b: any) => b[1] - a[1]);
  const topSvc: any = services[0];
  const topSvcShare = totalRev > 0 ? (topSvc[1] / totalRev) : 0;

  // Logic - Priority Rules
  if (topCatShare > 0.6) {
      return `⚠️ 營收過度集中「${topCat[0]}」，建議拓展第二獲利曲線。`;
  }

  if (topSvcShare > 0.5) {
      return `ℹ️ 「${topSvc[0]}」佔比過高，需留意市場價格波動。`;
  }

  if (hasFutureContribution && mom < -5) {
       return "📉 本月預估下滑，建議提早釋出促銷名額。";
  }

  if (mom > 20) {
      return "🚀 成長動能強勁，可加碼廣告擴大效應。";
  }
  
  if (mom < -10) {
      return "📉 營收衰退，建議檢視主力療程回購率。";
  }

  return "✅ 營收結構穩健，建議持續優化術後體驗。";
}

// AI 建議：空間與設備分析（Rooms 專用）
export function generateRoomSuggestions(appointments: AppointmentRecord[]): string {
    // 1. Calculate Room Usage
    const roomUsage: Record<string, number> = {};
    let totalAppointments = 0;

    appointments.forEach(a => {
        if (a.status === 'cancelled') return;
        const room = a.room || "未知診間";
        roomUsage[room] = (roomUsage[room] || 0) + 1;
        totalAppointments++;
    });

    const sortedRooms = Object.entries(roomUsage).sort((a, b) => b[1] - a[1]);
    const topRoom = sortedRooms[0];
    const topShare = totalAppointments > 0 ? (topRoom[1] / totalAppointments) : 0;

    // 2. Calculate Equipment Usage
    const equipUsage: Record<string, number> = {};
    appointments.forEach(a => {
        if (a.status === 'cancelled' || !a.equipment) return;
        equipUsage[a.equipment] = (equipUsage[a.equipment] || 0) + 1;
    });
    const sortedEquip = Object.entries(equipUsage).sort((a, b) => b[1] - a[1]);
    const topEquip = sortedEquip[0];


    // Logic - Priority Rules
    
    // Rule 1: Room Saturation (> 40% of all appts in one room is risky for flow)
    if (topShare > 0.4) {
        return `⚠️ 「${topRoom[0]}」使用率過高，建議開放備用診間分流。`;
    }

    // Rule 2: Equipment Bottleneck (Simple threshold)
    if (topEquip && topEquip[1] > (totalAppointments * 0.3)) {
        return `⚠️ 「${topEquip[0]}」需求量大，需留意預約衝突風險。`;
    }

    // Rule 3: Idle Resources (Identify bottom room)
    const bottomRoom = sortedRooms[sortedRooms.length - 1];
    if (bottomRoom && bottomRoom[1] === 0) {
         return `💡 「${bottomRoom[0]}」目前閒置，建議調整排程提升利用率。`;
    }

    return "✅ 目前空間配置平衡，請維持現有排程效率。";
}

// AI 建議：人力排班與負荷分析（Staff 專用 - 綜合 3 層數據）
// AI 建議：人力排班與負荷分析（Staff 專用 - 綜合 3 層數據）
export function generateStaffSuggestions(
    workloadList: any[], 
    roleFitStats: any[] = [], 
    bufferStats: any[] = []
): string {
    const suggestions: string[] = [];

    // 1. Analyze Workload (Layer 1)
    if (workloadList && workloadList.length > 0) {
        const sorted = [...workloadList].sort((a, b) => b.percentage - a.percentage);
        const highest = sorted[0];
        const isSim = sandboxStore.getState().isActive;
        
        if (highest.percentage > 80) {
            let specificAdvice = "";
            let title = highest.percentage > 90 ? "極高負載警示" : "高負載注意";
            let colorClass = highest.percentage > 90 ? "warning" : "warning"; // Both using warning style yellow/orange usually, user asked for Red for Compression > 70. Load > 90 is critical too.
            // Maintain existing styling logic or enhance? Existing used 'warning' for >90.
            
            // Skill-Aware Logic (Sandbox only)
            if (isSim) {
                 const sbState = sandboxStore.getState();
                 // Find category with highest growth
                 let maxGrowth = 0;
                 let topCat = "";
                 
                 Object.entries(sbState.serviceGrowth).forEach(([cat, val]) => {
                     if (val > maxGrowth) {
                         maxGrowth = val;
                         topCat = cat;
                     }
                 });

                 if (maxGrowth > 0.1 && topCat) { // Significant growth
                      // Find driver service in this category (using global dataStore for context)
                      const month = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
                      const relevantAppts = dataStore.appointments.filter(a => 
                          a.date.startsWith(month) && a.status === 'completed'
                      );
                      
                      // Count services in this category
                      const svcCounts: Record<string, number> = {};
                      relevantAppts.forEach(a => {
                          const sInfo = dataStore.services.find(s => s.service_name === a.service_item);
                          if (sInfo && (sInfo.category === topCat || (topCat==='inject' && ['Botox','Thread Lift'].includes(a.service_item)))) { // Loose match for demo
                               svcCounts[a.service_item] = (svcCounts[a.service_item] || 0) + 1;
                          }
                      });
                      
                      const topSvcName = Object.entries(svcCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
                      const topSvcInfo = dataStore.services.find(s => s.service_name === topSvcName);
                      
                      const requiredSkill = (topSvcInfo?.intensity === 'high' || topSvcInfo?.intensity === 'senior') ? '資深' : '';
                      const certName = topSvcName || topCat;

                      specificAdvice = `
                          <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #ccc; font-size:0.9em; color:#d97706;">
                              <strong>💡 精準招聘建議：</strong><br/>
                              模擬顯示 ${topCat} 類需求激增（${Math.round(maxGrowth*100)}%），且主要由 <strong>${certName}</strong> 驅動。<br/>
                              建議優先增補具備 <strong>${certName} 認證</strong> 之 <strong>${requiredSkill}${highest.role === 'doctor' ? '醫師' : '人員'}</strong>。
                          </div>
                      `;
                 }
            }

            suggestions.push(`
                <div class="ai-card ${colorClass}">
                    <div class="ai-card-title"><i class="fa-solid fa-triangle-exclamation"></i> ${title}</div>
                    <div class="ai-card-body">
                        <strong>${highest.role}</strong> 負載率達 ${highest.percentage}%${highest.percentage > 90 ? '，已達臨界點' : ' 偏高'}。
                        <ul>
                            <li>建議主動關懷疲勞狀況。</li>
                            <li>考慮由其他職級支援非核心業務。</li>
                        </ul>
                        ${specificAdvice}
                    </div>
                </div>
            `);
        }
    }

    // 2. Analyze Role Fit (Layer 2)
    if (roleFitStats && roleFitStats.length > 0) {
        const misaligned = roleFitStats.find(r => r.misalignmentScore > 20);
        if (misaligned) {
             suggestions.push(`
                <div class="ai-card info">
                    <div class="ai-card-title"><i class="fa-solid fa-user-gear"></i> 職務結構優化</div>
                    <div class="ai-card-body">
                        監測到 <strong>${misaligned.role}</strong> 執行了約 ${misaligned.misalignmentScore}% 的非核心任務。
                        <br/>若能將此部分轉移給助理或行政，可釋放更多高價值產能。
                    </div>
                </div>
             `);
        }
    }

    // 3. Analyze Buffer (Layer 3)
    if (bufferStats && bufferStats.length > 0) {
        const sbState = sandboxStore.getState();
        const isSim = sbState.isActive;
        
        // Critical Threshold for Sandbox
        const criticalList = bufferStats.filter(b => b.compressionRate > 70);
        const pressed = bufferStats.find(b => b.compressionRate > 30);

        if (criticalList.length > 0) {
             const names = criticalList.map(item => item.role.split('(')[0].trim()).join('、');
             const title = isSim ? "[模擬警示] 結構性崩潰風險" : "結構性崩潰風險";
             const desc = isSim ? "模擬顯示" : "監測顯示";
             
             suggestions.push(`
                <div class="ai-card danger" style="border-left: 5px solid #ef4444; background: #fef2f2;">
                    <div class="ai-card-title" style="color: #b91c1c;">
                        <i class="fa-solid fa-radiation"></i> ${title}
                    </div>
                    <div class="ai-card-body" style="color: #991b1b;">
                        ${desc} <strong>${names}</strong> 的壓縮率已突破 70%（極度危險）。
                        <br/>此強度下，人員將在 2 週內出現嚴重身心耗竭 (Burnout)，請務必下修目標或增補人力。
                    </div>
                </div>
             `);
        } else if (pressed) {
             // Standard Warning (>30%)
             suggestions.push(`
                <div class="ai-card danger">
                    <div class="ai-card-title"><i class="fa-solid fa-stopwatch-20"></i> 隱性疲勞風險</div>
                    <div class="ai-card-body">
                        <strong>${pressed.role}</strong> 的服務間隔頻繁被壓縮（壓縮率 ${pressed.compressionRate}%）。
                        <br/>雖帳面工時可能未滿，但高頻切換易導致認知疲勞，建議增加 5-10 分鐘緩衝。
                    </div>
                </div>
             `);
        }
    }

    // 4. Default / Fallback
    if (suggestions.length === 0) {
        return `
            <div class="ai-card success">
                <div class="ai-card-title"><i class="fa-solid fa-check-circle"></i> 狀態良好</div>
                <div class="ai-card-body">
                    目前人力與工作結構穩健，負載分佈均勻且緩衝充足。
                </div>
            </div>
        `;
    }

    return suggestions.join("");
}

// AI 建議：流失風險摘要（Customer Churn Summary）
export function calculateChurnRisks(customers: CustomerRecord[]) {
    if (!customers || customers.length === 0) {
        return { high: 0, medium: 0, low: 0, total: 0 };
    }

    // 1. Determine "Today" (Simulation)
    const dates = customers.map(c => c.last_visit_date).filter(d => d).sort();
    const lastDate = dates.length > 0 ? dates[dates.length - 1] : new Date().toISOString().split('T')[0];
    
    // Simulate current date as 1 day after the last record in DB to make analysis relevant
    const today = new Date(lastDate);
    today.setDate(today.getDate() + 1);

    let high = 0;
    let medium = 0;
    let low = 0;
    let total = customers.length;

    customers.forEach(c => {
        if (!c.last_visit_date) return;

        // [Filter] Rule 1: Exclude One-off customers (Visit count < 2)
        // Only focus on retaining recurring customers
        // Note: 'visit_count' in CustomerRecord needs to be accurate. 
        if ((c.visit_count || 0) < 2) return; 
        
        const last = new Date(c.last_visit_date);
        const diffTime = today.getTime() - last.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // [Filter] Rule 2: Exclude Lost (> 180 Days)
        if (diffDays > 180) return;

        // Dynamic Churn Threshold from LocalStorage
        const configChurn = parseInt(localStorage.getItem('config_churn_days') || '90', 10);
        // Define Risk Tiers based on Churn Config
        // High Risk: >= Churn Config
        // Medium Risk: >= Churn Config * 0.6
        // Low Risk: >= Churn Config * 0.3
        
        const highThres = configChurn;
        const medThres = Math.ceil(configChurn * 0.6);
        const lowThres = Math.ceil(configChurn * 0.3);
        
        if (diffDays >= highThres) {
            high++;
        } else if (diffDays >= medThres) {
            medium++;
        } else if (diffDays >= lowThres) {
            low++;
        }
    });

    return { high, medium, low, total };
}

export function generateChurnRiskReport(stats: { high: number, medium: number, low: number, total: number }): string {
    const { high, medium, low } = stats;
    const riskTotal = high + medium + low;
    
    if (riskTotal === 0) {
        return "✅ 目前無明顯流失風險，顧客回診狀況良好。";
    }

    const highShare = riskTotal > 0 ? (high / riskTotal) : 0;
    
    // 簡化為單一重點建議
    let mainPoint = "";
    let action = "";
    
    if (high > 15) {
        mainPoint = `🔴 高風險 ${high} 人需立即關懷`;
        action = "建議本週內電話聯繫，了解未回診原因";
    } else if (high > 0) {
        mainPoint = `🟡 ${high} 位高風險顧客待追蹤`;
        action = "建議安排專人關懷，避免流失";
    } else if (medium > 30) {
        mainPoint = `⚠️ 中風險群擴大（${medium} 人）`;
        action = "建議發送 LINE 提醒或優惠訊息";
    } else {
        mainPoint = `✅ 風險分布正常（高 ${high}、中 ${medium}）`;
        action = "維持現有服務品質即可";
    }

    return `${mainPoint}\n${action}`;
}


// Input Interface for Customer Operation Suggestions
export interface CustomerOperationInput {
  riskStats: { high: number; medium: number; low: number; total: number };
  newVsRet: { returningRate: number }; // Only need rate for now
  trend: { status: 'stable' | 'slight_decline' | 'significant_decline'; change: number };
}

/**
 * AI 建議：顧客經營策略 (Customer Operation Suggestions)
 * 任務：根據風險分級與結構，提供 1-2 週內的行動建議
 */
export function generateCustomerOperationSuggestions(input: CustomerOperationInput): string {
    const { riskStats, newVsRet, trend } = input;
    const { high, medium, low } = riskStats;
    const riskTotal = high + medium + low;
    
    // 1. If any risk detected (High+Medium+Low > 0), show Action
    if (riskTotal > 0) {
       // Logic for specific "16 Risk" case or general "Risk Detected"
       // User requested specific text format: "⚠️ 預防流失：檢測到 {Total} 位具備回診潛力之風險顧客，建議優先關懷 {Medium} 名中風險 VIP。"
       
       const targetGroup = medium > 0 ? "中風險 VIP" : "高風險顧客";
       const targetCount = medium > 0 ? medium : high;
       
       return `
         <div class="ai-card warning" style="
           display: block !important;
           visibility: visible !important;
           opacity: 1 !important;
           border-radius: 12px;
           padding: 20px;
           margin: 20px 0;
           background: rgba(245, 158, 11, 0.15);
           border-left: 4px solid #f59e0b;
           box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
           min-height: 80px;
         ">
             <div class="ai-card-title" style="
               display: flex;
               align-items: center;
               gap: 8px;
               font-weight: 700;
               font-size: 1.1rem;
               margin-bottom: 12px;
               color: #d97706;
             ">
               <i class="fa-solid fa-triangle-exclamation" style="color: #d97706;"></i> 
               預防流失
             </div>
             <div class="ai-card-body" style="
               font-size: 1rem;
               color: #1e293b;
               line-height: 1.6;
               font-weight: 500;
             ">
                 檢測到 <strong style="color: #92400e; font-weight: 700;">${riskTotal}</strong> 位具備回診潛力之風險顧客，建議優先關懷 <strong style="color: #92400e; font-weight: 700;">${targetCount}</strong> 名${targetGroup}。
             </div>
         </div>
       `;
    }
    
    // 2. Stable Case
    return `<p style='color: #475569; text-align: center; padding: 20px; font-size: 0.95rem; font-weight: 500;'>✅ 目前顧客狀況穩定，無需特別行動</p>`;
}
