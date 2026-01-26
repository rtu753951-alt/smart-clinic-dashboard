import { AppointmentRecord, ServiceInfo } from "../../data/schema.js";
import { dataStore } from "../../data/dataStore.js";
import { INVOLVEMENT_RATIOS } from "../../data/treatmentRatios.js";

interface RoleFitStats {
    role: string;
    totalTasks: number; // Represents "Effective Task Load" (Weighted Count)
    categoryStats: Record<string, number>; // Weighted Stats
    misalignmentScore: number; 
}

/**
 * 建立員工名稱對職務的對照表
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
 * 分析職務與服務項目的匹配度 (Grouped by Individual Name)
 * Updated: Uses Involvement Ratios to show "Effective Load" structure, not just raw count.
 */
export function calculateRoleFit(appointments: AppointmentRecord[], targetMonth?: string): RoleFitStats[] {
    const stats: Record<string, RoleFitStats> = {};
    const staffMap = getStaffRoleMap();

    // Helper to process a person
    const processPerson = (name: string, serviceCategory: string) => {
        if (!name || name === 'nan' || name === 'undefined') return;
        
        // Find staff type (role) for this person
        let roleType = staffMap.get(name);
        
        // Fallback or explicit fix for known doctors if missing in map (Safety net)
        if (!roleType) {
            if (name.includes('醫師')) roleType = 'doctor';
            else if (name.includes('護理師')) roleType = 'nurse';
            else if (name.includes('諮詢師')) roleType = 'consultant';
            else if (name.includes('美療師')) roleType = 'therapist';
            else if (name.includes('行政') || name.toLowerCase().includes('admin')) roleType = 'admin';
            else roleType = 'other';
        }

        const key = name; // Group by Name

        if (!stats[key]) {
            stats[key] = { 
                role: `${name} (${roleType})`, // Label for chart
                totalTasks: 0, 
                categoryStats: {}, 
                misalignmentScore: 0 
            };
        }

        // Apply Ratio
        const ratios = INVOLVEMENT_RATIOS[serviceCategory] || INVOLVEMENT_RATIOS['other'];
        const ratio = ratios[roleType] !== undefined ? ratios[roleType] : 0;

        // If ratio is 0, we can still count it as trace load (e.g. 0.05) or ignore.
        // But if we ignore, chart might be empty for primary assigned staff who has 0 ratio? 
        // (Unlikely, if assigned, ratio usually > 0 or at least should be).
        // Let's use actual ratio. Exception: if ratio is 0 but name is explicitly assigned, give minimum 0.05?
        // Let's stick to strict ratio to show the "Unbalanced" nature if desired.
        // But for "Structure Analysis", users usually want to see "What are they doing?".
        // If Laser=0.15 Doctor, then chart shows small Red bar. This is what user wants ("Proportional").
        
        const effectiveCount = ratio;

        if (effectiveCount > 0) {
            stats[key].totalTasks += effectiveCount;
            // Round to 2 decimals to avoid floating point mess in UI
            stats[key].categoryStats[serviceCategory] = (stats[key].categoryStats[serviceCategory] || 0) + effectiveCount;
        }
    };

    appointments.forEach(apt => {
        if (apt.status === 'cancelled') return;

        const serviceName = apt.service_item;
        const service = dataStore.services.find(s => s.service_name === serviceName);
        const category = service?.category || 'other';

        // 1. Process Doctor
        if (apt.doctor_name) {
            processPerson(apt.doctor_name.trim(), category);
        }

        // 2. Process Staff Role (Secondary)
        if (apt.assistant_name) {
            processPerson(apt.assistant_name.trim(), category);
        }
    });

    // --- INTEGRATION: Staff Workload CSV ---
    const manualWorkload = dataStore.staffWorkload || [];
    manualWorkload.forEach(rec => {
        // Filter by Date if provided
        if (targetMonth && !rec.date.startsWith(targetMonth)) return;

        let name = rec.staff_name.trim();
        const count = rec.count || 0;
        
        // Handle Garbled Name / Admin Detection Early
        // If name is ??? or empty, but action_type is admin
        const type = (rec.action_type || '').toLowerCase();
        if (name === '???' || name === '' || type === 'admin') {
             if (type === 'admin' || type.includes('admin') || name.includes('S016')) {
                 // Force a readable name for the chart
                 if (name === '???' || name === '') name = "行政人員 (Admin)";
             }
        }
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
        
        // Use Heuristics for Category Color
        let category = 'other'; // default
        if (role === 'nurse') category = 'inject'; 
        else if (role === 'therapist') category = 'rf';
        else if (role === 'consultant') category = 'consult';
        else if (role === 'doctor') category = 'laser';
        else if (role === 'admin') category = 'admin_work';
        
        // Manual records are usually "Tasks". Apply ratio.
        for(let i=0; i<count; i++) {
             processPerson(name, category);
        }
    });

    // Compute Scores & Rounding
    return Object.values(stats).map(stat => {
        const { role, totalTasks, categoryStats } = stat;
        let misalignedCount = 0;
        
        // Extract plain role type
        const roleType = role.includes('(') ? role.split('(')[1].replace(')', '').trim() : 'other';

        // Round all stats for clean display
        Object.keys(categoryStats).forEach(cat => {
            categoryStats[cat] = Math.round(categoryStats[cat] * 10) / 10;
        });

        // Definition of Misalignment 
        if (roleType === 'doctor') {
            misalignedCount += (categoryStats['consult'] || 0); 
            misalignedCount += (categoryStats['drip'] || 0);    
            misalignedCount += (categoryStats['facial'] || 0);  
        }
        else if (roleType === 'nurse') {
             misalignedCount += (categoryStats['consult'] || 0);
        }
        
        if (roleType === 'admin') {
             console.log(`[RoleFit] Found Admin Record: ${role}, Total: ${totalTasks}, Categories:`, categoryStats);
        }

        stat.totalTasks = Math.round(totalTasks * 10) / 10;
        stat.misalignmentScore = totalTasks > 0 ? Math.round((misalignedCount / totalTasks) * 100) : 0;
        return stat;
    });
}

export function generateRoleFitInsights(stats: RoleFitStats[]): string[] {
    const insights: string[] = [];
    
    // Find highest misalignment
    const sorted = [...stats].sort((a,b) => b.misalignmentScore - a.misalignmentScore);
    const critical = sorted.find(s => s.misalignmentScore > 20);

    if (critical) {
        insights.push(`⚠️ ${critical.role} 有 ${critical.misalignmentScore}% 的工作量屬於非核心範疇，建議進行職務優化。`);
    }

    if (insights.length === 0) {
        insights.push("✅ 目前各員工服務內容符合角色定位，無顯著錯置。");
    }

    return insights;
}
