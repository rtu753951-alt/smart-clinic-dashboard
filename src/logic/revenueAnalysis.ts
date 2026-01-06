import { AppointmentRecord } from "../data/schema.js";
import { formatCompactNT } from "../utils/currencyFormatter.js";

interface RevenueMilestone {
    triggered: boolean;
    title: string;
    description: string;
    priority: number; // 3: Year, 2: Week, 1: Month
}

/**
 * 營運捷報 (Dynamic Brief) 門檻檢核 logic
 * 
 * 規則：
 * 1. 超過同週期去年同期 (YoY)
 * 2. 超過上週最高單日 (Recent Peak)
 * 3. 超過近 30 日單日平均 (Monthly Avg)
 */
export function checkRevenueMilestones(
    targetDateStr: string, 
    appointments: AppointmentRecord[]
): RevenueMilestone | null {
    
    // 1. Pre-process: Build Daily Revenue Map
    // Only completed appointments count
    const revenueMap = new Map<string, number>();
    
    appointments.forEach(app => {
        if (app.status !== 'completed') return;
        if (!app.date) return;
        
        let amt = 0;
        // Handle different field names in schema variants
        const raw = (app as any).price || (app as any).amount || 0;
        if (typeof raw === 'number') amt = raw;
        else if (typeof raw === 'string') amt = parseFloat(raw);
        
        const current = revenueMap.get(app.date) || 0;
        revenueMap.set(app.date, current + amt);
    });

    const todayRevenue = revenueMap.get(targetDateStr) || 0;
    
    // If no revenue using targetDate, assume simulation might be using "Month" 
    // but Dynamic Brief usually calls out "Daily" or "Instant". 
    // If today is 0, we probably shouldn't show a "Great Job" alert unless it's strictly > avg (which might be 0?)
    // Let's assume if todayRevenue <= 0, no alert.
    if (todayRevenue <= 0) return null;

    const targetDate = new Date(targetDateStr);
    
    // 2. Calculate Metrics
    
    // A. 30-Day Average (excluding today)
    let sum30 = 0;
    let count30 = 0;
    for (let i = 1; i <= 30; i++) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const val = revenueMap.get(dStr);
        if (val !== undefined) { 
             sum30 += val;
             count30++; // Count days even if 0 revenue? Usually yes for "Average"
        } else {
             count30++; // Assume 0 if no record? Or skip? Standard is assume 0 revenue for that day.
        }
    }
    const avg30 = count30 > 0 ? sum30 / count30 : 0;

    // B. Last Week Max (excluding today)
    let max7 = 0;
    for (let i = 1; i <= 7; i++) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const val = revenueMap.get(dStr) || 0;
        if (val > max7) max7 = val;
    }

    // C. Last Year Same Date
    const dYear = new Date(targetDate);
    dYear.setFullYear(dYear.getFullYear() - 1);
    const lastYearStr = dYear.toISOString().split('T')[0];
    const lastYearRevenue = revenueMap.get(lastYearStr) || 0;

    // 3. Determine Trigger
    // Priority: Year > Week > Month
    
    // Check Year
    // Only valid if lastYearRevenue > 0 to be meaningful? 
    // If last year was 0, beating it is trivial. Let's require lastYear > 1000 or similar? 
    // Or just strictly >.
    if (lastYearRevenue > 0 && todayRevenue > lastYearRevenue) {
        return {
            triggered: true,
            title: `🎉 營運捷報：單日營收 ${formatCompactNT(todayRevenue)}`,
            description: `今日營收已超越去年同期單日水準 (YoY)，成長動能強勁。`,
            priority: 3
        };
    }
    
    // Check Week
    if (max7 > 0 && todayRevenue > max7) {
        return {
            triggered: true,
            title: `🎉 營運捷報：單日營收 ${formatCompactNT(todayRevenue)}`,
            description: `今日營收已突破上週最高單日紀錄，業績表現優異。`,
            priority: 2
        };
    }
    
    // Check Month Avg
    // Require at least some baseline
    if (avg30 > 0 && todayRevenue > avg30) {
        return {
            triggered: true,
            title: `🎉 營運捷報：單日營收 ${formatCompactNT(todayRevenue)}`,
            description: `今日營收已高於近 30 日單日平均水準，表現穩健。`,
            priority: 1
        };
    }

    return null;
}
