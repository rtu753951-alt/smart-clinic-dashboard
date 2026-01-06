/**
 * AI 趨勢摘要模組
 * 
 * 提供專業的營運分析,分為四個維度：
 * 1. 近期動能 (Recent Momentum)
 * 2. 結構變化 (Structural Changes)
 * 3. 瓶頸與承載 (Bottlenecks)
 * 4. 策略建議 (Strategy)
 */

import { AppointmentRecord } from "../data/schema.js";
import { calcRoomAndEquipmentUsage } from "./kpiEngine.js";

export interface AITrendReport {
  summary: string[];           // 簡要摘要 (保留給卡片顯示)
  detail: {
    recentMomentum: {
        stats: string[];       // 數據回顧
        conclusion: string;    // 結論用詞 (略為放緩/持平/回升)
    };
    structuralChanges: {
        highlights: string[];  // 變化亮點
        implication: string;   // 營收/人力含意
    };
    bottlenecks: {
        thresholds: string[];  // 接近閾值的角色/設備
        congestedSlots: string[]; // 易塞車時段
    };
    strategy: string[];        // 策略建議 ("因為...所以...")
  };
}

/**
 * 生成 AI 趨勢分析報告
 */
export function generateAITrendReport(
  appointments: AppointmentRecord[],
  staffList: any[] = [],
  services: any[] = []
): AITrendReport {
  
  // 取得目標月份
  const targetMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
  const today = new Date();
  
  // 1. 近期動能 (30天 vs 前30天)
  // 使用 "今天" 往前推 30 天作為基準，而非僅限於當月，以反映最新動能
  const momentum = generateRecentMomentum(appointments, today);
  
  // 2. 結構變化 (本月 vs 上月)
  const structure = generateStructuralChanges(appointments, targetMonth, services);
  
  // 3. 瓶頸與承載 (本月現況)
  const bottlenecks = generateBottlenecks(appointments, targetMonth, services, staffList);

  // 4. 策略建議 (綜合以上)
  const strategy = generateStrategy(momentum, structure, bottlenecks);

  // 簡要摘要 (保留給首頁卡片用，抽取各區精華)
  const summary = [
    `動能：${momentum.conclusion}`,
    `焦點：${structure.highlights[0] || '無顯著變化'}`,
    `瓶頸：${bottlenecks.congestedSlots[0] || '時段分佈平均'}`,
  ];

  return { 
    summary, 
    detail: {
        recentMomentum: momentum,
        structuralChanges: structure,
        bottlenecks: bottlenecks,
        strategy: strategy
    }
  };
}

// =========================================================================
// 1. 近期動能 (Recent Momentum)
// =========================================================================
function generateRecentMomentum(appointments: AppointmentRecord[], refDate: Date) {
    // 定義區間：近 30 天 (Period 1) vs 前 30 天 (Period 2)
    const p1End = new Date(refDate);
    const p1Start = new Date(refDate); p1Start.setDate(p1Start.getDate() - 30);
    
    const p2End = new Date(p1Start);
    const p2Start = new Date(p1Start); p2Start.setDate(p2Start.getDate() - 30);

    const getStats = (start: Date, end: Date) => {
        const apps = appointments.filter(a => {
            const d = new Date(a.date);
            return d >= start && d < end;
        });
        const total = apps.length;
        if (total === 0) return { showRate: 0, cancelRate: 0, total: 0, completed: 0 };

        const completed = apps.filter(a => a.status === 'completed').length;
        const cancelled = apps.filter(a => a.status === 'cancelled').length;
        
        // 分母使用 total (含 cancelled) 或 adjusted based on logic? 
        // 這裡簡單用 total for cancelRate, total-cancelled for showRate usually?
        // Let's use standard:
        // Show Rate = Completed / (Total - Cancelled)
        // Cancel Rate = Cancelled / Total
        const effective = total - cancelled;
        const showRate = effective > 0 ? (completed / effective) : 0;
        const cancelRate = cancelled / total;

        return { showRate, cancelRate, total, completed };
    };

    const current = getStats(p1Start, p1End);
    const prev = getStats(p2Start, p2End);

    // 判斷結論
    let conclusion = "持平";
    // 邏輯：看完成數 (Completed Volume) 的變化
    const volumeDiff = current.completed - prev.completed;
    const volumeDiffPct = prev.completed > 0 ? volumeDiff / prev.completed : 0;

    if (volumeDiffPct >= 0.1) conclusion = "回升";
    else if (volumeDiffPct <= -0.1) conclusion = "略為放緩";
    else conclusion = "持平";

    // 數據展示文字
    const stats: string[] = [];
    
    // 1. 到診率
    const currShowPct = Math.round(current.showRate * 100);
    const prevShowPct = Math.round(prev.showRate * 100);
    const showDiff = currShowPct - prevShowPct;
    stats.push(`近 30 天到診率 ${currShowPct}% (${showDiff >= 0 ? '+' : ''}${showDiff}%)`);

    // 2. 取消率
    const currCancelPct = Math.round(current.cancelRate * 100);
    const prevCancelPct = Math.round(prev.cancelRate * 100);
    const cancelDiff = currCancelPct - prevCancelPct;
    const cancelIcon = cancelDiff > 0 ? '🔺' : (cancelDiff < 0 ? 'good' : '-'); // Cancel rate up is bad usually
    // 若取消率上升 > 3% 標示
    stats.push(`預約取消率 ${currCancelPct}% (${cancelDiff > 0 ? '+' : ''}${cancelDiff}%)`);
    
    // 3. 預約量 (Optional)
    stats.push(`完成服務人次 ${current.completed} 人 (${volumeDiff >= 0 ? '+' : ''}${volumeDiff})`);

    return { stats, conclusion };
}

// =========================================================================
// 2. 結構變化 (Structural Changes)
// =========================================================================
function generateStructuralChanges(appointments: AppointmentRecord[], targetMonth: string, servicesList: any[]) {
    // 取得本月與上月數據
    const [year, month] = targetMonth.split('-').map(Number);
    const prevMonth = month === 1 
      ? `${year - 1}-12` 
      : `${year}-${String(month - 1).padStart(2, '0')}`;

    const getServiceCounts = (m: string) => {
        const counts: Record<string, number> = {};
        let total = 0;
        appointments.filter(a => a.date.startsWith(m) && a.status === 'completed').forEach(a => {
            if (a.service_item) {
                a.service_item.split(';').forEach(s => {
                    const name = s.trim();
                    if (name) {
                        counts[name] = (counts[name] || 0) + 1;
                        total++;
                    }
                });
            }
        });
        return { counts, total };
    };

    const curr = getServiceCounts(targetMonth);
    const prev = getServiceCounts(prevMonth);

    // 計算佔比變化
    const stats: {name: string, diffPct: number, currentCount: number}[] = [];
    const allServices = new Set([...Object.keys(curr.counts), ...Object.keys(prev.counts)]);

    allServices.forEach(name => {
        const cVal = curr.counts[name] || 0;
        const pVal = prev.counts[name] || 0;
            
        // 佔比 (Share)
        const cShare = curr.total > 0 ? cVal / curr.total : 0;
        const pShare = prev.total > 0 ? pVal / prev.total : 0;
        const diffShare = cShare - pShare; // 絕對百分比變化 (e.g. +5% share)

        // 只關注有一定量的項目 (本月 > 3 或 上月 > 3)
        if (cVal > 3 || pVal > 3) {
            stats.push({ name, diffPct: diffShare, currentCount: cVal });
        }
    });

    // 排序：升幅最大 與 降幅最大
    stats.sort((a, b) => b.diffPct - a.diffPct);
    
    // 找出亮點
    const highlights: string[] = [];
    const rising = stats[0];
    const falling = stats[stats.length - 1];

    if (rising && rising.diffPct > 0.03) { // 佔比增加 3% 以上
        highlights.push(`🔥 ${rising.name} 佔比顯著上升 (+${(rising.diffPct*100).toFixed(1)}%)`);
    }
    if (falling && falling.diffPct < -0.03) {
        highlights.push(`📉 ${falling.name} 需求佔比下滑 (${(falling.diffPct*100).toFixed(1)}%)`);
    }
    
    if (highlights.length === 0) {
        highlights.push("各項療程佔比分佈穩定，無顯著結構異動");
    }

    // 營收/人力含意
    let implication = "目前服務結構穩定，有利於維持標準化作業流程。";
    if (rising && rising.diffPct > 0.05) {
        // Find service price/duration info? Assuming high impact if big shift
        implication = `主力項目轉移至 ${rising.name}，建議預留相關時段與耗材庫存。`;
    }

    return { highlights, implication };
}

// =========================================================================
// 3. 瓶頸與承載 (Bottlenecks)
// =========================================================================
function generateBottlenecks(appointments: AppointmentRecord[], targetMonth: string, services: any[], staffList: any[]) {
    const currentMonthApps = appointments.filter(a => a.date.startsWith(targetMonth));
    
    // A. 設備/空間接近閾值
    const thresholds: string[] = [];
    const { roomUsage, equipmentUsage } = calcRoomAndEquipmentUsage(currentMonthApps, services);
    
    // Check Rooms
    roomUsage.forEach(r => {
        if (r.usageRate >= 85) thresholds.push(`⚠️ ${r.room} 使用率 (${r.usageRate}%) 瀕臨滿載`);
    });
    // Check Equip
    equipmentUsage.forEach(e => {
        if (e.usageRate >= 85) thresholds.push(`⚠️ ${e.equipment} 負載 (${e.usageRate}%) 過高`);
    });

    // Check Staff (Logic simplified: simply high count of appointments per month? e.g. > 150)
    const docCounts: Record<string, number> = {};
    currentMonthApps.forEach(a => {
        if(a.doctor_name) docCounts[a.doctor_name] = (docCounts[a.doctor_name] || 0) + 1;
    });
    Object.entries(docCounts).forEach(([doc, count]) => {
        if(count > 150) thresholds.push(`👨‍⚕️ ${doc} 本月診次負荷偏重 (${count}診)`);
    });

    if (thresholds.length === 0) thresholds.push("✅ 目前無資源超過警示閾值");

    // B. 易塞車時段 (Heatmap logic subset)
    const congestedSlots: string[] = [];
    const hourCounts = new Array(24).fill(0);
    
    currentMonthApps.forEach(a => {
        if (a.time && a.status !== 'cancelled') {
            const h = parseInt(a.time.split(':')[0], 10);
            if (!isNaN(h)) hourCounts[h]++;
        }
    });

    // Find peak hours
    const maxVal = Math.max(...hourCounts);
    const peaks = hourCounts.map((v, i) => ({h: i, v})).filter(item => item.v >= maxVal * 0.9 && item.v > 5); // Top 90% and >5 apps
    
    if (peaks.length > 0) {
        const timeStr = peaks.map(p => `${p.h}:00`).join('、');
        congestedSlots.push(`⏰ 晚間尖峰集中於 ${timeStr}，候診時間可能拉長`);
    } else {
        congestedSlots.push("✅ 各時段客流分佈平均，無明顯壅塞");
    }

    return { thresholds, congestedSlots };
}

// =========================================================================
// 4. 策略建議 (Strategy)
// =========================================================================
function generateStrategy(
    momentum: { conclusion: string, stats: string[] },
    structure: { highlights: string[], implication: string },
    bottlenecks: { thresholds: string[], congestedSlots: string[] }
): string[] {
    const strategies: string[] = [];

    // Rule 1: Congestion -> Buffer
    const isCongested = bottlenecks.congestedSlots.some(s => s.includes("尖峰") || s.includes("壅塞"));
    if (isCongested) {
        strategies.push("因為晚間尖峰集中 → 建議實施錯峰預約優惠或保留 15% 現場彈性緩衝 (Buffer)。");
    }

    // Rule 2: Equipment/Room Overload -> Maintenance/Scheduling
    const isOverload = bottlenecks.thresholds.some(s => s.includes("負載") || s.includes("滿載"));
    const overloadItem = bottlenecks.thresholds.find(s => s.includes("負載") || s.includes("滿載"));
    if (isOverload) {
        const target = overloadItem?.split(' ')[1] || "關鍵資源"; // Try to extract name
        strategies.push(`因為 ${target} 接近承載上限 → 建議評估加開設備或嚴格管控該項目的連續預約。`);
    }

    // Rule 3: Momentum Slowing -> Recall
    if (momentum.conclusion === "略為放緩") {
        strategies.push("因為近期預約動能放緩 → 建議啟動舊客喚醒計畫 (Wake-up Call) 或針對流失客群發送關懷訊息。");
    }

    // Rule 4: Structural Shift -> Training
    const rising = structure.highlights.find(h => h.includes("上升") || h.includes("增加"));
    if (rising) {
        // 提取療程名稱簡單版
        const name = rising.split(' ')[1] || "熱門項目";
        strategies.push(`因為 ${name} 需求顯著升溫 → 建議確認相關耗材庫存水位，並安排助理支援該療程前置作業。`);
    }

    // Default if few strategies
    if (strategies.length < 2) {
        strategies.push("因為營運與資源指標穩定 → 建議著重於優化現有SOP與提升顧客滿意度細節。");
    }

    return strategies.slice(0, 3); // Return max 3
}

