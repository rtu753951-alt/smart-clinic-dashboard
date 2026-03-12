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
 * 分析職務與服務項目匹配度 (Grouped by Individual Name)
 * Updated: Uses Involvement Ratios to show "Effective Load" structure, not just raw count.
 */
export function calculateRoleFit(appointments: AppointmentRecord[], targetMonth?: string): RoleFitStats[] {
    const stats: Record<string, RoleFitStats> = {};
    const staffMap = getStaffRoleMap();

    // Helper to process a person
    const processPerson = (name: string, serviceCategory: string) => {
        if (!name || name === 'nan' || name === 'undefined') return;
        
        const safeCategory = (serviceCategory || 'other').toLowerCase().trim();
        
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

        // Apply Ratio - For "Role Fit" bar chart, researchers often want to see "What items are they doing?"
        // If we use fractional ratios (0.15), the bars are too microscopic to see (0.15 vs 250 scale).
        // Let's use raw count (1.0 per person per appointment) to show the "Architecture" clearly.
        const effectiveCount = 1.0; 

        if (effectiveCount > 0) {
            stats[key].totalTasks += effectiveCount;
            // Round to 2 decimals to avoid floating point mess in UI
            stats[key].categoryStats[safeCategory] = (stats[key].categoryStats[safeCategory] || 0) + effectiveCount;
        }
    };

    if (!appointments || appointments.length === 0) {
        console.warn("[RoleFit] No appointments provided for analysis.");
    }

    appointments.forEach(apt => {
        if (apt.status === 'cancelled') return;

        const serviceName = (apt.service_item || '').trim();
        const service = dataStore.services.find(s => s.service_name === serviceName);
        const category = service?.category || 'other';

        // 1. Process Doctor
        if (apt.doctor_name && apt.doctor_name !== 'nan') {
            processPerson(apt.doctor_name.trim(), category);
        }

        // 2. Process Staff Role (Secondary)
        if (apt.assistant_name && apt.assistant_name !== 'nan') {
            processPerson(apt.assistant_name.trim(), category);
        }
    });
    
    console.log(`[RoleFit] Processed ${appointments.length} appointments. Current stats keys:`, Object.keys(stats));

    // --- INTEGRATION: Staff Workload CSV ---
    const manualWorkload = dataStore.staffWorkload || [];
    manualWorkload.forEach(rec => {
        // Filter by Date if provided
        if (targetMonth && !rec.date.startsWith(targetMonth)) return;

        let name = rec.staff_name.trim();
        const count = rec.count || 0;
        
        // Handle Garbled Name / Admin Detection Early
        const type = (rec.action_type || '').toLowerCase();
        if (name === '???' || name === '' || type === 'admin') {
            if (type === 'admin' || type.includes('admin') || name.includes('S016')) {
                if (name === '???' || name === '') name = "行政人員 (Admin)";
            }
        }
        let role = staffMap.get(name);

        if (!role) {
            const typeLower = (rec.action_type || '').toLowerCase();
            if (typeLower === 'admin' || typeLower.includes('admin')) role = 'admin';
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
        
        // Manual records are usually "Tasks". 
        for(let i=0; i<count; i++) {
             processPerson(name, category);
        }
    });

    console.log(`[RoleFit] Logic complete. Final staff count: ${Object.keys(stats).length}`);

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
