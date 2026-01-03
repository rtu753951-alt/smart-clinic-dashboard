import { AppointmentRecord, ServiceInfo } from "../../data/schema.js";
import { dataStore } from "../../data/dataStore.js";

interface RoleFitStats {
    role: string;
    totalTasks: number;
    categoryStats: Record<string, number>; // e.g. { 'consult': 10, 'inject': 5 }
    misalignmentScore: number; // 0-100, higher is worse (more low-value tasks)
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
 */
export function calculateRoleFit(appointments: AppointmentRecord[]): RoleFitStats[] {
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

        stats[key].totalTasks++;
        stats[key].categoryStats[serviceCategory] = (stats[key].categoryStats[serviceCategory] || 0) + 1;
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
        if (apt.staff_role) {
            processPerson(apt.staff_role.trim(), category);
        }
    });

    // Compute Scores
    return Object.values(stats).map(stat => {
        const { role, totalTasks, categoryStats } = stat;
        let misalignedCount = 0;
        
        // Extract plain role type from label "Name (role)"
        const roleType = role.includes('(') ? role.split('(')[1].replace(')', '').trim() : 'other';

        // Definition of Misalignment 
        if (roleType === 'doctor') {
            misalignedCount += (categoryStats['consult'] || 0); 
            misalignedCount += (categoryStats['drip'] || 0);    
            misalignedCount += (categoryStats['facial'] || 0);  
        }
        else if (roleType === 'nurse') {
             misalignedCount += (categoryStats['consult'] || 0);
        }

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
        insights.push(`⚠️ ${critical.role} 有 ${critical.misalignmentScore}% 的服務屬於非核心範疇，建議進行職務優化。`);
    }

    if (insights.length === 0) {
        insights.push("✅ 目前各員工服務內容符合角色定位，無顯著錯置。");
    }

    return insights;
}
