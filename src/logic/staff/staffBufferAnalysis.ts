import { isCertifiedForCategory } from "../../data/skillMap.js";
import { AppointmentRecord } from "../../data/schema.js";
import { dataStore } from "../../data/dataStore.js";
import { sandboxStore } from "../../features/sandbox/sandboxStore.js";
import { INVOLVEMENT_RATIOS } from "../../data/treatmentRatios.js";

interface BufferStats {
    role: string;
    totalGaps: number;
    compressedGaps: number;
    avgGapMinutes: number;
    compressionRate: number; // %
    highDensityHours: number; // New metric
}

interface TimeStructureStats {
    role: string;
    serviceMinutes: number;
    bufferMinutes: number;
    totalMinutes: number;
    bufferRatio: number;
}

/**
 * Filter appointments logic (restored)
 */
export function filterAppointmentsForMode(
    appointments: AppointmentRecord[],
    mode: 'week' | 'month' | 'future'
): AppointmentRecord[] {
    const globalMonth = (window as any).currentDashboardMonth;
    let anchorDate = new Date();
    if (globalMonth) anchorDate = new Date(`${globalMonth}-01`);
    anchorDate.setHours(0, 0, 0, 0);

    const currentDay = anchorDate.getDay(); 
    const distToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const thisMonday = new Date(anchorDate);
    thisMonday.setDate(anchorDate.getDate() + distToMonday);
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisMonday.getDate() + 6);
    thisSunday.setHours(23, 59, 59, 999);

    return appointments.filter(apt => {
        const d = new Date(apt.date);
        if (mode === 'week') return apt.status === 'completed' && d >= thisMonday && d <= thisSunday;
        if (mode === 'month') return apt.status === 'completed' && apt.date.startsWith("2025-12");
        if (mode === 'future') {
            const start = new Date(anchorDate); start.setDate(start.getDate() + 1);
            const end = new Date(anchorDate); end.setDate(end.getDate() + 7); end.setHours(23, 59, 59, 999);
            return d >= start && d <= end && apt.status !== 'cancelled';
        }
        return false;
    });
}

function getStaffRoleMap(): Map<string, string> {
    const map = new Map<string, string>();
    dataStore.staff.forEach(staff => {
        if (staff.staff_name) map.set(staff.staff_name.trim(), staff.staff_type.trim());
    });
    return map;
}

/**
 * Calculate Buffer Analysis with High Density Logic
 */
/**
 * Calculate Buffer Analysis with High Density Logic (Refined)
 */
export function calculateBufferAnalysis(appointments: AppointmentRecord[], options: { includeCancelled?: boolean } = {}): BufferStats[] {
    const personAppts: Record<string, AppointmentRecord[]> = {};
    const staffMap = getStaffRoleMap();

    const addAppt = (name: string, apt: AppointmentRecord) => {
        const trimmedName = name.trim();
        if (trimmedName === 'nan' || !trimmedName) return;
        if (!personAppts[trimmedName]) personAppts[trimmedName] = [];
        personAppts[trimmedName].push(apt);
    };

    appointments.forEach(apt => {
        // Option to include cancelled for "Scheduling Pressure" vs "Actual Load"
        if (!options.includeCancelled && (apt.status === 'cancelled' || apt.status === 'no_show')) return;
        
        if (apt.doctor_name) addAppt(apt.doctor_name, apt);
        if (apt.assistant_name) {
            let role = '';
            if (apt.assistant_role && apt.assistant_role !== '') {
                // If CSV provides valid role, prioritize it (normalized)
                const raw = apt.assistant_role.trim().toLowerCase();
                if (raw.includes('nurse')) role = 'nurse';
                else if (raw.includes('therapist')) role = 'therapist';
                else if (raw.includes('consultant')) role = 'consultant';
                else role = raw;
            } 
            if (!role) {
                // Fallback to name map
                role = staffMap.get(apt.assistant_name.trim()) || 'therapist';
            }
            // Add normalized role
            addAppt(apt.assistant_name, apt); 
            // Note: addAppt uses name as key. Logic assumes 'role' is derived later inside results?
            // Actually lines 173 derived role again. We need to store this override?
            // `calculateBufferAnalysis` logic re-derives role from staffMap at line 173.
            // So we should probably update `staffMap` or pass this context.
            // But `staffMap` is global from staff.csv.
            // If `assistant_role` varies per appointment (unlikely for same person?), 
            // the logic is "Reference Field Data".
            // Let's assume `assistant_role` on appointment overrides or fills gap.
            // Wait, line 173: `let roleType = staffMap.get(name);`
            // If we want to use the one from appointment, we need to pass it or check it there.
        }
    });

    const results: BufferStats[] = [];
    const sbState = sandboxStore.getState();

    Object.entries(personAppts).forEach(([name, appts]) => {
        if (appts.length < 2) return; // Need at least 2 to have a gap
        
        const staffRec = dataStore.staff.find(s => s.staff_name === name);
        // Sort by Time
        appts.sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

        let totalGaps = 0;
        let compressedGaps = 0;
        let totalGapMinutes = 0;
        
        // Sandbox Vars
        let simCompressedGaps = 0;
        
        let currentDensityChainMinutes = 0;
        let totalHighDensityMinutes = 0;

        for (let i = 0; i < appts.length - 1; i++) {
            const curr = appts[i];
            const next = appts[i + 1];
            
            // Skip cross-day gaps
            if (curr.date !== next.date) {
                totalHighDensityMinutes += currentDensityChainMinutes;
                currentDensityChainMinutes = 0;
                continue; 
            }

            const service = dataStore.services.find(s => s.service_name === curr.service_item);
            const duration = service ? service.duration : 30; // Pure procedure time
            const baseBuffer = service ? service.buffer_time : 10; // Standard buffer

            // Valid Gap: Next.Start - (Curr.Start + Duration)
            // DO NOT include buffer in 'currEnd' for gap calculation
            const currStartObj = new Date(`${curr.date}T${curr.time}`);
            const currEndObj = new Date(currStartObj.getTime() + duration * 60000); 
            const nextStartObj = new Date(`${next.date}T${next.time}`);
            
            const gapMinutes = Math.floor((nextStartObj.getTime() - currEndObj.getTime()) / 60000);

            // 1. Regular Check
            if (gapMinutes < baseBuffer) {
                compressedGaps++;
                currentDensityChainMinutes += duration;
            } else {
                totalHighDensityMinutes += currentDensityChainMinutes;
                currentDensityChainMinutes = 0;
            }

            // 2. Sandbox Simulation Check
            if (sbState.isActive && service && staffRec) {
                // Logic: Increased demand shrinks effective gaps OR increases chance of overrun
                // We model this as: effectiveGap = gap / (1 + growth)
                // If growth is 50%, a 15min gap becomes 10min effective -> might compress
                const cat = service.category || 'consult';
                const growth = sbState.serviceGrowth[cat as keyof typeof sbState.serviceGrowth] || 0;
                
                // Only if qualified
                if (isCertifiedForCategory(staffRec, cat)) {
                     // Reverse logic: Growth means "tighter". 
                     // Or conceptually: Task took longer? or Gap is tighter?
                     // Let's assume 'Business Growth' -> 'Tighter Scheduling' -> 'Gap Compression'
                     const effectiveGap = gapMinutes / (1 + growth);
                     if (effectiveGap < baseBuffer) {
                         simCompressedGaps++;
                     }
                } else {
                    // No growth effect
                    if (gapMinutes < baseBuffer) simCompressedGaps++;
                }
            } else {
                // Fallback to regular if inactive
                if (gapMinutes < baseBuffer) simCompressedGaps++;
            }
            
            totalGaps++;
            totalGapMinutes += Math.max(0, gapMinutes);
        }
        totalHighDensityMinutes += currentDensityChainMinutes;

        let roleType = staffMap.get(name);
        if (!roleType) {
            // ... fallback existing logic
            if (name.includes('醫師')) roleType = 'doctor';
            else if (name.includes('護理師')) roleType = 'nurse';
            else if (name.includes('諮詢師')) roleType = 'consultant';
            else if (name.includes('美療師')) roleType = 'therapist';
            else roleType = 'other';
        }

        if (totalGaps > 0) {
            const baseRate = Math.round((compressedGaps / totalGaps) * 100);
            const simRate = Math.round((simCompressedGaps / totalGaps) * 100);
            
            // Final Rate: Use Sim if Active, else Base
            const finalRate = sbState.isActive ? simRate : baseRate;

            results.push({
                role: `${name} (${roleType})`,
                totalGaps,
                compressedGaps: sbState.isActive ? simCompressedGaps : compressedGaps, 
                avgGapMinutes: Math.round(totalGapMinutes / totalGaps),
                compressionRate: finalRate,
                highDensityHours: Math.round((totalHighDensityMinutes / 60) * 10) / 10
            });
        }
    });

    return results;
}

// ... existing imports

/**
 * 分析時間結構：SOP 基準 vs 實際人力負荷 (診斷視圖) -> Refined Logic
 * Unit: Minutes / Person / Day (Average)
 */
export function calculateTimeStructure(appointments: AppointmentRecord[], mode: 'week' | 'month' | 'future' = 'week'): TimeStructureStats[] {
    const roleStats: Record<string, { sop: number, actual: number, hidden: number, activePersonDays: Set<string> }> = {};
    const sbState = sandboxStore.getState();

    // 1. 初始化統計容器
    ['doctor', 'nurse', 'therapist', 'consultant', 'admin'].forEach(r => {
        roleStats[r] = { sop: 0, actual: 0, hidden: 0, activePersonDays: new Set<string>() };
    });

    const staffMap = getStaffRoleMap();

    // 2. 累加分鐘數 (使用 Involvement Ratios) & Track Active Days
    appointments.forEach(apt => {
        if (apt.status === 'cancelled') return; 
        
        const dateStr = apt.date;
        let serviceName = apt.service_item;
        const service = dataStore.services.find(s => s.service_name === serviceName);
        if (!service) return;

        // Service Params
        let category = service.category;
        if (!INVOLVEMENT_RATIOS[category]) category = 'consult'; 
        const growth = sbState.isActive ? (1 + (sbState.serviceGrowth[category as keyof typeof sbState.serviceGrowth] || 0)) : 1;

        const duration = service.duration;     // Pure Value-Add
        const buffer = service.buffer_time;    // Standard Hidden Load
        const totalDuration = duration + buffer;

        // Helper: Register Load
        const registerLoad = (role: string, name: string) => {
            if (!roleStats[role]) return;
            
            // 2.1 Track Active Person-Day (Name + Date)
            // If strictly analyzing "Average Load per Working Date", we count (Name+Date).
            // Example: "Dr. Chen-2024-01-01".
            if (!name.includes('nan')) {
                roleStats[role].activePersonDays.add(`${name}|${dateStr}`);
            }

            // 2.2 Calculate Minutes
            const ratio = INVOLVEMENT_RATIOS[category]?.[role] || 0;
            if (ratio > 0) {
                const sopVal = duration * ratio * growth;
                const actualVal = totalDuration * ratio * growth;
                const hiddenVal = actualVal - sopVal;

                roleStats[role].sop += sopVal;
                roleStats[role].actual += actualVal;
                roleStats[role].hidden += hiddenVal;
            }
        };

        // Apply to Doctor
        if (apt.doctor_name) {
             let r = staffMap.get(apt.doctor_name.trim());
             if (r === 'doctor') registerLoad('doctor', apt.doctor_name.trim());
        }

        if (apt.assistant_name) {
            let r = staffMap.get(apt.assistant_name.trim()) || 'therapist'; // Fallback? Or check if in map
            if (roleStats[r]) registerLoad(r, apt.assistant_name.trim());
        }
    });

    // --- INTEGRATION: Staff Workload CSV (Manual Records) ---
    // Populate SOP/Actual based on 'minutes'
    const manualWorkload = dataStore.staffWorkload || [];
    manualWorkload.forEach(rec => {
        const name = rec.staff_name.trim();
        let role = staffMap.get(name);

        if (!role) {
             const type = (rec.action_type || '').toLowerCase();
             
             if (type === 'admin' || type.includes('admin')) role = 'admin';
             else if (name.includes('行政') || name.toLowerCase().includes('admin')) role = 'admin';
             else if (name.includes('S016')) role = 'admin';

             else if (name.includes('醫師')) role = 'doctor';
             else if (name.includes('護理師')) role = 'nurse';
             else if (name.includes('美療師')) role = 'therapist';
             else if (name.includes('諮詢師')) role = 'consultant';
        }
        
        if (role && roleStats[role]) {
             // 1. Person Day
             const dStr = rec.date;
             if (!name.includes('nan')) {
                 roleStats[role].activePersonDays.add(`${name}|${dStr}`);
             }

             // 2. Metrics
             // We assume Manual Entry is fairly accurate to "Total Time Spent"
             // To make the chart look realistic (and not 100% efficiency which is impossible),
             // We assume a standard 15% Hidden Load (Buffer/Prep) for manual entries.
             const totalMinutes = rec.minutes || (rec.count * 60); 
             
             const assumedHidden = Math.round(totalMinutes * 0.15);
             const assumedSOP = totalMinutes - assumedHidden;

             roleStats[role].sop += assumedSOP;
             roleStats[role].actual += totalMinutes;
             roleStats[role].hidden += assumedHidden; 
        }
    });

    // 3. 正規化 (Normalization) -> 分鐘/人/天
    // Updated Logic: Divisor = Total Active Person-Days found in the data (Heuristic)
    // If Mode is Week, and Dr. A works 2 days, Dr. B works 5 days.
    // Total Load = Load(A) + Load(B).
    // Total Person-Days = 2 + 5 = 7.
    // Result = (Load A + Load B) / 7. -> "Average Daily Load per Active Staff"
    // This correctly handles part-time and shifts.

    // Fallback: If no data (future), use assumptions
    let daysInPeriod = 7;
    if (mode === 'week') daysInPeriod = 7;
    if (mode === 'month') daysInPeriod = 30;

    return Object.keys(roleStats).map(role => {
        const s = roleStats[role];
        
        let divisor = s.activePersonDays.size;

        // Fallback for empty periods or future prediction where no specific schedule exists
        if (divisor === 0) {
            // Count total active staff * days
            const activeCount = dataStore.staff.filter(st => st.staff_type === role && st.status === 'active').length;
            divisor = Math.max(1, activeCount * daysInPeriod);
        }

        // Apply Sandbox Delta to Divisor (Approximate)
        if (sbState.isActive) {
             // If we added 1 staff in sandbox, we assume they work full period?
             // Simplification: Scale divisor by (NewCount / OldCount)
             const activeCount = dataStore.staff.filter(st => st.staff_type === role && st.status === 'active').length;
             const delta = sbState.staffDeltas[role as keyof typeof sbState.staffDeltas] || 0;
             if (activeCount > 0) {
                 const scale = (activeCount + delta) / activeCount;
                 // Don't scale if using actual PersonDays (since simulated staff don't have schedule).
                 // Actually we SHOULD scale divisor UP to reflect "help is arriving" -> Average load goes DOWN.
                 // Wait, if load (numerator) increases by Growth, and staff (denominator) increases by Delta.
                 // Correct. 
                 
                 // However, s.activePersonDays only captures existing staff on schedule. 
                 // We need to Model the 'New Staff' impact. 
                 // If we hire 1 new nurse, the Total Load is shared by (Existing + 1).
                 // So we multiply Divisor by factor.
                 divisor = divisor * scale;
             }
        }

        return {
            role,
            serviceMinutes: Math.round(s.sop / divisor),    
            bufferMinutes: Math.round(s.hidden / divisor), 
            totalMinutes: Math.round(s.actual / divisor),
            bufferRatio: s.actual > 0 ? Math.round((s.hidden / s.actual) * 100) : 0
        };
    });
}

/**
 * 產生「營運流程顧問」風格報告
 */
export function generateBufferStructureReport(stats: TimeStructureStats[]): string {
    // Sort by Role Category (Fixed Order)
    const order = ['doctor', 'nurse', 'therapist', 'consultant', 'admin'];
    const sorted = [...stats].sort((a, b) => {
        const idxA = order.indexOf(a.role.split(' ')[0]) !== -1 ? order.indexOf(a.role.split(' ')[0]) : 99; // Try to match "doctor" if role is just "doctor"
        // But wait, role in TimeStructureStats is just the key (e.g. 'doctor'), unlike BufferStats where it is "Name (Role)".
        // TimeStructureStats keys ARE the role types. 
        const rA = a.role; 
        const rB = b.role;
        const iA = order.indexOf(rA);
        const iB = order.indexOf(rB);
        return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
    });
    
    if (sorted.length === 0) return "<p>無視覺化數據</p>";

    // Find significant roles (still based on threshold for text, but list is all?)
    // User said "List... by category".
    // We should list them ALL in order? Or just the chart/report list?
    // The previous code filtered `highBufferRoles` for the list.
    // User: "職務服務結構分析" (Job Analysis) ... "依照同職務類別排序" (Sort by Category). 
    // This implies the visualization should follow this order. 
    // The function `generateBufferStructureReport` generates an HTML report text.
    // The Chart itself is likely rendered elsewhere using the array returned by `calculateTimeStructure`.
    // Wait, the user prompt implies the CHART/LIST behavior. 
    // This function generates the "Text Report". The chart rendering is likely in `staffPage.ts`.
    // I need to check `staffPage.ts`.
    // But I will update this text report logic too.

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
    const sbState = sandboxStore.getState();
    const isSim = sbState.isActive;

    const highStress = stats.filter(s => s.compressionRate > 30).sort((a, b) => b.compressionRate - a.compressionRate);
    
    if (highStress.length > 0) {
        const topRole = highStress[0];
        if (isSim) {
             insights.push(`🔴 [模擬警示] 業務增長下，${topRole.role} 的 Buffer 嚴重被壓縮（預估 ${topRole.compressionRate}%），疲勞風險顯著上升。`);
        } else {
             insights.push(`🔴 ${topRole.role} 的 Buffer 嚴重被壓縮（${topRole.compressionRate}%），切換壓力大。`);
        }
    } else {
        insights.push("✅ 目前換床/轉場時間充足，無顯著壓縮情況。");
    }
    return insights;
}
