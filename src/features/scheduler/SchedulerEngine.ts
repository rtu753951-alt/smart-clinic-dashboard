
// src/features/scheduler/SchedulerEngine.ts

import { StaffRecord, AppointmentRecord, ServiceInfo } from "../../data/schema";
import { SchedulerConfig, SimulationResult, DailySchedule, StaffAssignment, ShiftType } from "./types";
import { DemandEstimator } from "./DemandEstimator";
import { ScoringRules } from "./ScoringRules";

export class SchedulerEngine {
    
    constructor(
        private staffList: StaffRecord[],
        private appointments: AppointmentRecord[], // For demand history
        private services: ServiceInfo[],           // For demand mapping
        private pairHistory: Map<string, number>   // For affinity
    ) {}

    public run(config: SchedulerConfig): SimulationResult {
        const logs: string[] = [];
        logs.push("Starting Simulation...");

        // 1. Estimate Demand
        const demands = DemandEstimator.estimate(this.appointments, this.services, config);
        logs.push(`Demand estimated for ${demands.length} shifts.`);

        // 2. Initialize State
        const schedule: DailySchedule[] = [];
        const staffHours = new Map<string, number>(); // Track weekly hours
        const assignedHistory: StaffAssignment[] = []; // Linear history

        // 3. Simulation Loop
        // Group demands by Date to process Day by Day
        const demandsByDate = new Map<string, any>(); 
        demands.forEach(d => {
            if (!demandsByDate.has(d.date)) demandsByDate.set(d.date, { date: d.date, shifts: {} });
            demandsByDate.get(d.date).shifts[d.shift] = d;
        });

        // Loop Dates
        const dates = Array.from(demandsByDate.keys()).sort();
        
        dates.forEach(dateStr => {
            const currentDaySchedule: DailySchedule = { date: dateStr, shifts: {} };
            const dayDemands = demandsByDate.get(dateStr);

            // Loop Shifts (AM -> PM -> EV)
            ['AM', 'PM', 'EV'].forEach(shiftKey => {
                const shift = shiftKey as ShiftType;
                const shiftDemand = dayDemands.shifts[shift];
                if (!shiftDemand) return;

                const assignments: StaffAssignment[] = [];
                const required = { ...shiftDemand.requirements };
                const unfilled: Record<string, number> = {};

                // Order of assignment: Doctor -> Nurse -> Therapist -> Consultant -> Admin
                // Why? Because Nurses usually assigned to specific Doctors (Affinity).
                const roleOrder = ['doctor', 'nurse', 'therapist', 'consultant', 'admin'];

                roleOrder.forEach(role => {
                    const count = required[role] || 0;
                    
                    for (let i = 0; i < count; i++) {
                        // Select Candidate
                        const chosen = this.selectBestCandidate(
                            role, 
                            dateStr, 
                            shift, 
                            config, 
                            staffHours, 
                            assignments, // Current shift peers
                            assignedHistory // Past history
                        );

                        if (chosen) {
                            assignments.push(chosen);
                            assignedHistory.push(chosen);
                            
                            // Track Hours (Heuristic: 4 hours per shift)
                            const currentH = staffHours.get(chosen.staffName) || 0;
                            staffHours.set(chosen.staffName, currentH + 4);
                        } else {
                            if (!unfilled[role]) unfilled[role] = 0;
                            unfilled[role]++;
                            logs.push(`[Shortage] Could not fill ${role} on ${dateStr} ${shift}`);
                        }
                    }
                });

                currentDaySchedule.shifts[shift] = {
                    assignments,
                    unfilledRoles: unfilled,
                    isBaseline: shiftDemand.isBaseline
                };
            });

            schedule.push(currentDaySchedule);
        });

        // 4. Metrics
        const metrics = this.calculateMetrics(schedule, staffHours, config);

        return { schedule, metrics, logs };
    }

    private selectBestCandidate(
        role: string,
        date: string,
        shift: ShiftType,
        config: SchedulerConfig,
        staffHours: Map<string, number>,
        currentShiftAssignments: StaffAssignment[],
        history: StaffAssignment[]
    ): StaffAssignment | null {
        
        // Filter Candidates
        const candidates = this.staffList.filter(s => {
            // 1. Role Match
            if (s.staff_type !== role) return false;
            
            // 2. Status Active
            if (s.status !== 'active') return false;

            // 3. Availability (Simplified)
            // Assuming simplified string "Mon-Sat" or similar.
            // For MVP: assume everyone available unless specific Leave logic implemented later.
            // Or use simple heuristics on s.availability string?
            // Let's assume OK for now.

            // 4. Already Assigned in this shift?
            if (currentShiftAssignments.some(a => a.staffName === s.staff_name)) return false;

            // 5. Max Hours Limit
            if (config.useWorkloadLimit) {
                const h = staffHours.get(s.staff_name) || 0;
                // Try parse max_hours_per_week, default 40
                const max = (s as any).max_hours_per_week || 44; 
                if (h >= max) return false;
            }

            return true;
        });

        if (candidates.length === 0) return null;

        // Score Candidates
        const scored = candidates.map(c => {
            const scoreObj = ScoringRules.calculateScore(
                c, role, date, shift, 
                currentShiftAssignments, 
                history, 
                config, 
                this.pairHistory
            );
            return { raw: c, scoreObj };
        });

        // Sort descending
        scored.sort((a, b) => b.scoreObj.totalScore - a.scoreObj.totalScore);

        // Pick Top
        const best = scored[0];
        const currentH = staffHours.get(best.raw.staff_name) || 0;
        
        return {
            date,
            shift,
            role,
            staffName: best.raw.staff_name,
            scoreDetails: best.scoreObj,
            cumulativeHours: currentH + 4 // Estimated new total
        };
    }

    private calculateMetrics(schedule: DailySchedule[], hours: Map<string, number>, config: SchedulerConfig) {
        let totalSlots = 0;
        let unfilledSlots = 0;
        
        schedule.forEach(d => {
            ['AM', 'PM', 'EV'].forEach(k => {
                const s = d.shifts[k as ShiftType];
                if(s) {
                    totalSlots += s.assignments.length + Object.values(s.unfilledRoles).reduce((a,b)=>a+b,0);
                    unfilledSlots += Object.values(s.unfilledRoles).reduce((a,b)=>a+b,0);
                }
            });
        });

        const coverage = totalSlots > 0 ? ((totalSlots - unfilledSlots) / totalSlots) * 100 : 100;

        let overworked = 0;
        hours.forEach((h, name) => {
            const staff = this.staffList.find(s => s.staff_name === name);
            const max = (staff as any)?.max_hours_per_week || 44;
            if (h > max) overworked++;
        });

        return {
            coverage: Math.round(coverage),
            overworkedCount: overworked,
            monopolyRiskCount: 0, // Todo
            avgAffinityScore: 0   // Todo
        };
    }
    // Public method for Scenario Events
    public recommendSubstitutes(
        currentResult: SimulationResult,
        date: string,
        shift: ShiftType,
        leaveStaffName: string,
        count: number = 5
    ): StaffAssignment[] {
        // 1. Find the shift in the current schedule
        const daySchedule = currentResult.schedule.find(d => d.date === date);
        if (!daySchedule) return [];
        const shiftData = daySchedule.shifts[shift];
        if (!shiftData) return [];

        // 2. Identify Role of the leaver
        const leaverAssignment = shiftData.assignments.find(a => a.staffName === leaveStaffName);
        if (!leaverAssignment) return []; // Staff not found in this shift
        const role = leaverAssignment.role;

        // 3. Reconstruct State for scoring
        // We need 'currentShiftAssignments' (excluding leaver)
        const currentShiftAssignments = shiftData.assignments.filter(a => a.staffName !== leaveStaffName);
        
        // We need 'staffHours' approximation (use hours from currentResult??)
        // Ideally we re-calculate hours up to this point, but for MVP let's use global hours from metrics?
        // Actually, let's just use 0, or rebuild map from schedule quickly.
        const staffHours = new Map<string, number>();
        currentResult.schedule.forEach(d => {
             ['AM', 'PM', 'EV'].forEach(s => {
                 const sh = d.shifts[s as ShiftType];
                 if (sh) {
                     sh.assignments.forEach(a => {
                         if (a.staffName === leaveStaffName && d.date === date && s === shift) return; // Skip the leave shift
                         const existing = staffHours.get(a.staffName) || 0;
                         staffHours.set(a.staffName, existing + 4);
                     });
                 }
             });
        });

        // 4. Find Candidates
        // Filter: Same Role, Active, Not in this shift
        const candidates = this.staffList.filter(s => {
            if (s.staff_type !== role) return false;
            if (s.status !== 'active') return false;
            if (s.staff_name === leaveStaffName) return false;
            if (currentShiftAssignments.some(a => a.staffName === s.staff_name)) return false; // Already working
            return true;
        });

        // 5. Score
        const scored = candidates.map(c => {
            const scoreObj = ScoringRules.calculateScore(
                c, role, date, shift,
                currentShiftAssignments,
                [], // Simplified history context for scenario (or could pass full history if available)
                { ...currentResult.metrics, ...{ useAffinity: true, useMonopoly: true, useWorkloadLimit: false } } as any, // Mock config
                this.pairHistory
            );

            // Add Penalty for High Hours (Soft Constraint)
            const hours = staffHours.get(c.staff_name) || 0;
            const max = (c as any).max_hours_per_week || 44;
            if (hours >= max) {
                scoreObj.totalScore -= 50; // Heavy penalty but allow listing
                scoreObj.breakdown['fatigue'] = -50;
            }

            return {
                date,
                shift,
                role,
                staffName: c.staff_name,
                scoreDetails: scoreObj,
                cumulativeHours: hours
            };
        });

        // 6. Sort & Return
        scored.sort((a, b) => b.scoreDetails.totalScore - a.scoreDetails.totalScore);
        
        return scored.slice(0, count);
    }
}
