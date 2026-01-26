
// src/features/scheduler/ScoringRules.ts
import { StaffRecord } from "../../data/schema";
import { SchedulerConfig, CandidateScore, ShiftType, StaffAssignment } from "./types";

export class ScoringRules {

    /**
     * Calculate score for a candidate against a specific role/shift
     */
    static calculateScore(
        staff: StaffRecord,
        role: string,
        date: string,
        shift: ShiftType,
        existingAssignments: StaffAssignment[], // Who else is in this shift? (For affinity)
        pastAssignments: StaffAssignment[],     // History (For monopoly/fatigue)
        config: SchedulerConfig,
        pairHistory: Map<string, number>        // Historical Affinity
    ): CandidateScore {
        
        let breakdowns = {
            base: 0,
            affinity: 0,
            monopoly: 0,
            fatigue: 0,
            leave: 0
        };

        // 1. Base Score (Skill Level)
        const level = staff.skill_level?.toLowerCase() || 'mid';
        if (level === 'senior') breakdowns.base = 100;
        else if (level === 'mid') breakdowns.base = 80;
        else breakdowns.base = 60;

        // 2. Affinity (Collaboration)
        if (config.useAffinity) {
            let totalAffinity = 0;
            // Check against everyone already assigned to this shift
            existingAssignments.forEach(peer => {
                const key = [staff.staff_name, peer.staffName].sort().join('|');
                const count = pairHistory.get(key) || 0;
                // Heuristic: +1 point per past collaboration, capped at 20
                totalAffinity += Math.min(count, 20);
            });
            breakdowns.affinity = totalAffinity * (config.affinityWeight || 1);
        }

        // 3. Monopoly (Anti-Monopoly)
        if (config.useMonopoly) {
            // Check how many times this staff paired with the Doctors in this shift recently
            // Simplified: Just Check if they worked TOO MUCH recently overall
            // Real Monopoly: check specific pair.
            
            // Let's implement specific pair monopoly
            existingAssignments.forEach(peer => {
                if (peer.role === 'doctor') { // Only care about monopolizing doctors
                    // Count how many times they paired in past 7 days
                    let recentPairs = 0;
                    pastAssignments.forEach(past => {
                        // Check date diff (last 30 days)
                        // This logic requires robust history.
                        // Simplified: Use pairHistory (Long term) as penalty if threshold hit?
                        // Actually pairHistory is "Total". We need "Recent".
                        // Let's rely on simple repeated assignment penalty for MVP
                    });
                }
            });
        }
        
        // 4. Fatigue (Consecutive Shifts)
        // Check if worked previous shift (AM -> PM is okay? PM -> Next Day AM?)
        // AM->PM is double shift.
        const workedSameDay = existingAssignments.some(a => a.staffName === staff.staff_name); 
        // Note: existingAssignments is THIS shift. 
        // We need "Assignments on this DATE but different SHIFT".
        // The Engine handles passing relevant history.
        
        // Placeholder for now.
        
        return {
            staffName: staff.staff_name,
            totalScore: Object.values(breakdowns).reduce((a, b) => a + b, 0),
            breakdown: breakdowns
        };
    }
}
