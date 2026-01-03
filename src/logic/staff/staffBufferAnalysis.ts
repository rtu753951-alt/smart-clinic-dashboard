import { AppointmentRecord } from "../../data/schema.js";
import { dataStore } from "../../data/dataStore.js";

interface BufferStats {
    role: string;
    totalGaps: number;
    compressedGaps: number; // Gap < Standard Buffer
    avgGapMinutes: number;
    compressionRate: number; // %
}

interface TimeStructureStats {
    role: string;
    serviceMinutes: number;
    bufferMinutes: number; // Based on Standard Buffer definition
    totalMinutes: number;
    bufferRatio: number; // %
}

/**
 * 取得 Hidden Load 分析用的篩選資料
 * 
 * 模式定義：
 * - week: 本週 (2025-12-15 ~ 12-21，假設今日為 12-16)，僅 status=completed
 * - month: 本月 (2025-12-01 ~ 12-31)，僅 status=completed
 * - future: 未來7天 (2025-12-17 ~ 12-23)，包含 completed + no_show (視為 Booked)，排除 cancelled
 */
export function filterAppointmentsForMode(
    appointments: AppointmentRecord[],
    mode: 'week' | 'month' | 'future'
): AppointmentRecord[] {
    const globalMonth = (window as any).currentDashboardMonth;
    let anchorDate = new Date(); // Default to Now
  
    if (globalMonth) {
        // e.g. "2024-01" -> Anchor "2024-01-01"
        anchorDate = new Date(`${globalMonth}-01`);
        // If the selected month is significantly in the past/future, 'future' mode might be weird.
        // But for 'week' and 'month', this is correct.
        // For 'future' (next 7 days from anchor), it makes sense to use anchor as 'today'.
    }
    
    // Normalize to Midnight
    anchorDate.setHours(0, 0, 0, 0);

    // Calculate Week Range (Monday to Sunday relative to Anchor)
    const currentDay = anchorDate.getDay(); 
    const distToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const thisMonday = new Date(anchorDate);
    thisMonday.setDate(anchorDate.getDate() + distToMonday);
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisMonday.getDate() + 6);
    thisSunday.setHours(23, 59, 59, 999);

    console.log(`[BufferAnalysis] Filtering '${mode}' with Anchor: ${anchorDate.toISOString().slice(0,10)}`);

    return appointments.filter(apt => {
        const d = new Date(apt.date);
        
        if (mode === 'week') {
            // Range: Mon - Sun
            // Status: completed only
            if (apt.status !== 'completed') return false;
            return d >= thisMonday && d <= thisSunday;
        }

        if (mode === 'month') {
            // Range: Current Month (Dec)
            // Status: completed only
            if (apt.status !== 'completed') return false;
            return apt.date.startsWith("2025-12");
        }

        if (mode === 'future') {
            // Range: Today+1 to Today+7
            const start = new Date(anchorDate);
            start.setDate(start.getDate() + 1);
            const end = new Date(anchorDate);
            end.setDate(end.getDate() + 7);
            end.setHours(23, 59, 59, 999);

            if (d >= start && d <= end) {
                // Future Rule: include completed (simulated as booked) and no_show (booked but missed -> occupies slot in projection)
                // Exclude cancelled
                return apt.status !== 'cancelled';
            }
            return false;
        }

        return false;
    });
}

/**
 * 分析隱性負載：Buffer 壓縮率 (Stress)
 */
/**
 * Helper: Build Staff Role Map
 */
function getStaffRoleMap(): Map<string, string> {
    const map = new Map<string, string>();
    dataStore.staff.forEach(staff => {
        if (staff.staff_name) {
            map.set(staff.staff_name.trim(), staff.staff_type.trim());
        }
    });
    return map;
}

/**
 * 分析隱性負載：Buffer 壓縮率 (Stress)
 * 修正：針對每一位員工 (醫師、護理師、美療師) 個別計算時間間隙
 */
export function calculateBufferAnalysis(appointments: AppointmentRecord[]): BufferStats[] {
    // 1. Group appointments by Person Name (Doctor + Staff)
    const personAppts: Record<string, AppointmentRecord[]> = {};
    const staffMap = getStaffRoleMap();

    const addAppt = (name: string, apt: AppointmentRecord) => {
        const trimmedName = name.trim();
        if (trimmedName === 'nan' || !trimmedName) return;
        
        if (!personAppts[trimmedName]) {
            personAppts[trimmedName] = [];
        }
        personAppts[trimmedName].push(apt);
    };

    appointments.forEach(apt => {
        if (apt.status === 'cancelled' || apt.status === 'no_show') return;
        
        // Add to Doctor's schedule
        if (apt.doctor_name) {
            addAppt(apt.doctor_name, apt);
        }
        
        // Add to Assistant's schedule
        if (apt.staff_role) {
            addAppt(apt.staff_role, apt);
        }
    });

    const results: BufferStats[] = [];

    // 2. Analyze gaps for each person
    Object.entries(personAppts).forEach(([name, appts]) => {
        if (appts.length < 2) return; // Need at least 2 tasks to have a gap

        // Sort by Time
        appts.sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

        let totalGaps = 0;
        let compressedGaps = 0;
        let totalGapMinutes = 0;

        for (let i = 0; i < appts.length - 1; i++) {
            const curr = appts[i];
            const next = appts[i + 1];

            // Only measure gap if on the same day
            if (curr.date !== next.date) continue;

            // Get Service Info (for current task's duration)
            const service = dataStore.services.find(s => s.service_name === curr.service_item);
            const duration = service ? service.duration : 30;
            const buffer = service ? service.buffer_time : 10; // Standard Buffer requirement

            // End of Current
            const currEnd = new Date(new Date(`${curr.date}T${curr.time}`).getTime() + duration * 60000);
            
            // Start of Next
            const nextStart = new Date(`${next.date}T${next.time}`);
            
            // Gap
            const gapMinutes = Math.floor((nextStart.getTime() - currEnd.getTime()) / 60000);

            // Logic: Gap should be >= Buffer
            if (gapMinutes < buffer) {
                compressedGaps++;
            }
            totalGaps++;
            totalGapMinutes += gapMinutes;
        }

        // Determine correct role label
        let roleType = staffMap.get(name);
        
        // Fallback
        if (!roleType) {
            if (name.includes('醫師')) roleType = 'doctor';
            else if (name.includes('護理師')) roleType = 'nurse';
            else if (name.includes('諮詢師')) roleType = 'consultant';
            else if (name.includes('美療師')) roleType = 'therapist';
            else roleType = 'other';
        }

        if (totalGaps > 0) {
            results.push({
                role: `${name} (${roleType})`, // Correct Label: Name (RoleType)
                totalGaps,
                compressedGaps,
                avgGapMinutes: Math.round(totalGapMinutes / totalGaps),
                compressionRate: Math.round((compressedGaps / totalGaps) * 100)
            });
        }
    });

    return results;
}

import { INVOLVEMENT_RATIOS } from "./staffWorkloadCards.js";

// ... existing imports

/**
 * 分析時間結構：SOP Benchmark vs Actual Load (診斷視圖)
 * 改為計算「每人平均每日分鐘數」
 */
export function calculateTimeStructure(appointments: AppointmentRecord[], mode: 'week' | 'month' | 'future' = 'week'): TimeStructureStats[] {
    const roleStats: Record<string, { sop: number, actual: number, hidden: number }> = {};
    
    // 1. 初始化統計容器
    ['doctor', 'nurse', 'therapist', 'consultant'].forEach(r => {
        roleStats[r] = { sop: 0, actual: 0, hidden: 0 };
    });

    // 2. 累加分鐘數 (使用 Involvement Ratios)
    appointments.forEach(apt => {
        // Future mode includes no_show as 'booked' demand
        if (apt.status === 'cancelled') return; 
        
        let serviceName = apt.service_item;
        const service = dataStore.services.find(s => s.service_name === serviceName);
        if (!service) return;

        // 判斷 Service Category 以取得 Ratio
        // 若找不到 category key，使用 default logic? 
        // INVOLVEMENT_RATIOS keys: inject, rf, laser, drip, consult
        // service.category likely matches these.
        let category = service.category;
        if (!INVOLVEMENT_RATIOS[category]) category = 'consult'; // Fallback

        const duration = service.duration;     // SOP 核心時間
        const buffer = service.buffer_time;    // SOP 緩衝 (或是 Hidden Load 來源)
        const totalDuration = duration + buffer;

        // 分配給各角色
        // 遍歷所有角色，因為一個服務可能多人參與 (Occupancy)
        Object.keys(roleStats).forEach(role => {
            const ratio = INVOLVEMENT_RATIOS[category]?.[role] || 0;
            
            if (ratio > 0) {
                // SOP Benchmark = Service Duration * Ratio
                const sopVal = duration * ratio;
                
                // Actual Load (Occupancy) = (Service + Buffer) * Ratio
                // 這裡假設 Buffer 也依照同樣比例分配给該角色 (通常換床/準備是該角色要做的)
                const actualVal = totalDuration * ratio;

                // Hidden Load = Actual - SOP
                const hiddenVal = actualVal - sopVal;

                roleStats[role].sop += sopVal;
                roleStats[role].actual += actualVal;
                roleStats[role].hidden += hiddenVal;
            }
        });
    });

    // 3. 正規化 (Normalization) -> 分鐘/人/天
    // 假設天數
    let days = 1;
    if (mode === 'week') days = 7;
    if (mode === 'month') days = 30; // 簡化
    if (mode === 'future') days = 7;

    // 假設人數 (從 DataStore 抓取 Active Staff 數量)
    // 簡單實作：計算 staff.csv 中 active 的人數
    const staffCounts = {
        doctor: dataStore.staff.filter(s => s.staff_type === 'doctor' && s.status === 'active').length || 1,
        nurse: dataStore.staff.filter(s => s.staff_type === 'nurse' && s.status === 'active').length || 1,
        therapist: dataStore.staff.filter(s => (s.staff_type === 'therapist' || (s.staff_type as string) === 'beauty_therapist') && s.status === 'active').length || 1,
        consultant: dataStore.staff.filter(s => s.staff_type === 'consultant' && s.status === 'active').length || 1
    };

    return Object.keys(roleStats).map(role => {
        const s = roleStats[role];
        const count = staffCounts[role as keyof typeof staffCounts] || 1;
        const divisor = days * count;

        return {
            role,
            // 轉為「每日每人平均」
            serviceMinutes: Math.round(s.sop / divisor),    // Reuse field name for 'SOP Benchmark'
            bufferMinutes: Math.round(s.hidden / divisor),  // Reuse field name for 'Hidden Load'
            totalMinutes: Math.round(s.actual / divisor),
            bufferRatio: s.actual > 0 ? Math.round((s.hidden / s.actual) * 100) : 0
        };
    });
}

/**
 * 產生「營運流程顧問」風格報告
 */
export function generateBufferStructureReport(stats: TimeStructureStats[]): string {
    // Sort by Buffer Ratio desc
    const sorted = [...stats].sort((a, b) => b.bufferRatio - a.bufferRatio);
    if (sorted.length === 0) return "<p>無視覺化數據</p>";

    const highBufferRoles = sorted.filter(s => s.bufferRatio > 25); // Threshold for "High"
    const topRole = highBufferRoles.length > 0 ? highBufferRoles[0] : null;

    // Part 1: Key Interpretation
    let interpretation = "";
    if (topRole) {
        interpretation = `本月 ${topRole.role} 的時間結構中，${topRole.bufferRatio}% 用於緩衝（換床、準備）。顯示該職務的「流程碎片化」程度較高，需承擔隱性切換成本。`;
    } else {
        interpretation = "各職務服務與緩衝比例均衡，無異常碎片化，流程連續性良好。";
    }

    // Part 2: Significant Roles
    let significantRoles = "";
    if (highBufferRoles.length > 0) {
        significantRoles = `<ul style="margin-top:8px; padding-left:20px; color:#555;">` + 
            highBufferRoles.map(r => {
                let reason = "短療程切換頻繁"; // Default guess
                if (r.role === 'doctor') reason = "診間跳轉與看診間隙";
                if (r.role === 'therapist') reason = "儀器準備、更換床單";
                if (r.role === 'consultant') reason = "接待轉場";
                
                return `<li><strong>${r.role} (Buffer ${r.bufferRatio}%)</strong>：${reason}。此為流程必要成本，非效率問題。</li>`;
            }).join("") + 
            `</ul>`;
    } else {
        significantRoles = "<p style='margin-top:8px; color:#555;'>未發現 Buffer 佔比異常偏高的角色。</p>";
    }

    // Part 3: Structural Reminder
    let reminder = "";
    if (highBufferRoles.length > 0) {
        reminder = "若結構性隱性負載長期過高，易導致人員產生「認知疲勞」，即便工時未滿載，壓力也會上升。";
    } else {
        reminder = "目前的流程結構對專注力保護較佳，建議維持此節奏。";
    }

    return `
        <div class="ai-consultant-report" style="font-family: 'Noto Sans TC', sans-serif; line-height: 1.6; color: #374151; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
            <p style="font-size: 0.85rem; color: #9ca3af; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e5e7eb;">
                以下解讀僅針對人力時間結構與隱性負載，不涉及排班或績效評估。
            </p>
            
            <h4 style="font-size: 0.95rem; font-weight: 600; color: #1f2937; margin-bottom: 6px;">① 圖表重點解讀</h4>
            <p style="margin-bottom: 12px; font-size: 0.95rem;">${interpretation}</p>
            
            <h4 style="font-size: 0.95rem; font-weight: 600; color: #1f2937; margin-bottom: 6px;">② 隱性負載顯著的角色</h4>
            ${significantRoles}
            
            <h4 style="font-size: 0.95rem; font-weight: 600; color: #1f2937; margin-top: 12px; margin-bottom: 6px;">③ 結構性提醒</h4>
            <p style="font-size: 0.95rem;">${reminder}</p>
        </div>
    `;
}

export function generateBufferInsights(stats: BufferStats[]): string[] {
    const insights: string[] = [];
    const highStress = stats.filter(s => s.compressionRate > 30).sort((a, b) => b.compressionRate - a.compressionRate);
    if (highStress.length > 0) {
        insights.push(`🔴 ${highStress[0].role} 的 Buffer 嚴重被壓縮（${highStress[0].compressionRate}%），切換壓力大。`);
    } else {
        insights.push("✅ 目前換床/轉場時間充足，無顯著壓縮情況。");
    }
    return insights;
}
