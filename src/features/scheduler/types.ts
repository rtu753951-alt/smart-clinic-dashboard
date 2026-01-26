
// src/features/scheduler/types.ts

export type ShiftType = 'AM' | 'PM' | 'EV';

export interface SchedulerConfig {
    startDate: string; // YYYY-MM-DD
    days: number;      // Duration (e.g. 7 days)
    shiftsPerDay: 2 | 3; 
    
    // Toggles
    useAffinity: boolean;
    useMonopoly: boolean;
    useWorkloadLimit: boolean;
    
    // Parameters
    monopolyThreshold: number; // e.g. 0.4 (40%)
    maxConsecutiveShifts: number; // e.g. 3
    affinityWeight: number; // 0.0 - 1.0
    baselineEnabled: boolean; // NEW: Toggle baseline staffing
    baselineCounts?: Record<string, number>; // NEW: User defined counts
}

export interface ShiftDemand {
    date: string;
    shift: ShiftType;
    requirements: Record<string, number>; // role -> count
    isBaseline?: boolean; // NEW: True if demand was 0 but baseline applied
}

export interface CandidateScore {
    staffName: string;
    totalScore: number;
    breakdown: {
        base: number;       // Skill level
        affinity: number;   // Past collaboration
        monopoly: number;   // Penalty
        fatigue: number;    // Penalty
        leave: number;      // Penalty (availability)
    };
}

export interface StaffAssignment {
    date: string;
    shift: ShiftType;
    role: string;
    staffName: string;
    isManualOverride?: boolean; // If pinned by user
    scoreDetails?: CandidateScore;
    cumulativeHours?: number; // NEW: Tracked hours at time of assignment
}

export interface DailySchedule {
    date: string;
    shifts: {
        [key in ShiftType]?: {
            assignments: StaffAssignment[];
            unfilledRoles: Record<string, number>; // shortage
            isBaseline?: boolean; // NEW: Propagated from ShiftDemand
        }
    };
}

export interface SimulationResult {
    schedule: DailySchedule[];
    metrics: {
        coverage: number;      // %
        overworkedCount: number; 
        monopolyRiskCount: number;
        avgAffinityScore: number;
    };
    logs: string[]; // Debug logs
}

export interface PairHistory {
    // key: "StaffA|StaffB" (alphabetical order)
    // value: count
    pairCounts: Map<string, number>;
}
