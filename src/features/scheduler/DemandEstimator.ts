
// src/features/scheduler/DemandEstimator.ts
import { AppointmentRecord, ServiceInfo } from "../../data/schema";
import { ShiftDemand, ShiftType, SchedulerConfig } from "./types";

import { INVOLVEMENT_RATIOS } from "../../data/treatmentRatios";

export class DemandEstimator {
    // CATEGORY_RULES removed - replaced by shared treatmentRatios

    /**
     * Estimate staff demand from Historical Appointments
     */
    static estimate(
        appointments: AppointmentRecord[], 
        services: ServiceInfo[],
        config: SchedulerConfig
    ): ShiftDemand[] {
        const demandMap = new Map<string, ShiftDemand>();

        // 1. Initialize Map for the range
        const start = new Date(config.startDate);
        for(let i=0; i<config.days; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            
            ['AM', 'PM'].forEach(shift => { 
                const key = `${dateStr}_${shift}`;
                demandMap.set(key, {
                    date: dateStr,
                    shift: shift as ShiftType,
                    requirements: { doctor: 0, nurse: 0, therapist: 0, consultant: 0, admin: 1 } // Base admin 1
                });
            });
        }

        // 2. Aggregate Appointments (Duration-based)
        const SHIFT_LENGTH_MINUTES = 240; // 4 hours per shift (Standard)

        appointments.forEach(appt => {
            const timeSlot = this.inferTimeSlot(appt);
            const key = `${appt.date}_${timeSlot}`;
            
            const demand = demandMap.get(key);
            if (!demand) return; 

            // Find Service Info
            const service = services.find(s => s.service_name === appt.service_item);
            const duration = service ? (service.duration + (service.buffer_time || 0)) : 60; // Default 60 mins
            const cat = this.getCategory(appt.service_item, services);
            
            // Use Shared Ratios
            const ratios = INVOLVEMENT_RATIOS[cat] || INVOLVEMENT_RATIOS['other'];

            Object.entries(ratios).forEach(([role, ratio]) => {
                if (ratio <= 0) return;
                
                if (demand.requirements[role] === undefined) demand.requirements[role] = 0;
                
                // Accumulate Minutes: Duration * Involvement Ratio
                // Note: We store "Minutes" temporarily in the map value, will normalize later
                // But requirements is typed as number (count).
                // Let's assume requirements holds "Total Minutes Loaded" first, then we ceil it.
                // Wait, if I change the meaning of requirements mid-flight, I should be careful.
                // Let's store raw minutes in a separate tracking object or just assume 
                // the number in requirements is "Minutes" for now.
                demand.requirements[role] += (duration * ratio);
            });
        });

        // 3. Normalize (Minutes -> Headcount) & Apply Baseline
        const demands = Array.from(demandMap.values());
        demands.forEach(d => {
            let hasOrganicDemand = false;

            Object.keys(d.requirements).forEach(role => {
                const totalMinutes = d.requirements[role];
                
                if (role !== 'admin') {
                     // Headcount = Total Minutes / Shift Length (240)
                     // e.g. 300 minutes load -> 1.25 staff -> 1.3 staff (1 decimal)
                     let count = totalMinutes / SHIFT_LENGTH_MINUTES;
                     
                     // If there IS load but very small, keep at least 0.1 to show valid demand?
                     // Or just use the raw fraction.
                     // Let's use 1 decimal place precision.
                     count = Math.floor(count * 10) / 10;
                     if (totalMinutes > 0 && count < 0.1) count = 0.1;

                     // Legacy Baseline Check: If "count" was relying on ceil to reach 1...
                     // Now the baseline logic below will push it to min baseline if enabled.
                     // If organic demand is tiny (e.g. 0.05), effectively 0.1.

                     d.requirements[role] = count;

                     if (count > 0) hasOrganicDemand = true;
                }
            });

            // Mark if this shift is purely running on baseline (no organic demand)
            d.isBaseline = !hasOrganicDemand && config.baselineEnabled;

            // Apply Baseline (Max Logic)
            if (config.baselineEnabled && config.baselineCounts) {
                Object.entries(config.baselineCounts).forEach(([role, count]) => {
                    const current = d.requirements[role] || 0;
                    if (count > current) {
                        d.requirements[role] = count;
                    }
                });
            }
        });

        return demands;
    }

    /**
     * Infer Time Slot (AM/PM) from available fields
     * Priority: timeSlot > datetime_start > time > default
     */
    private static inferTimeSlot(appt: any): ShiftType {
        // 1. Explicit TimeSlot (Legacy or Pre-processed)
        if (appt.timeSlot === "AM" || appt.timeSlot === "PM") {
            return appt.timeSlot as ShiftType;
        }

        // 2. Datetime Start (ISO)
        // e.g. "2023-10-01T14:30:00" or "2023-10-01 14:30:00"
        if (appt.datetime_start) {
            const dt = new Date(appt.datetime_start);
            if (!isNaN(dt.getTime())) {
                const hour = dt.getHours();
                // Logic: hour < 12 -> "AM", else -> "PM"
                return hour < 12 ? 'AM' : 'PM';
            }
        }

        // 3. Fallback: separate Time field
        if (appt.time) {
            const hour = parseInt(appt.time.split(':')[0]);
            if (!isNaN(hour)) {
                return hour < 12 ? 'AM' : 'PM';
            }
        }

        // 4. Default Safe Fallback
        return 'AM';
    }

    private static getCategory(itemName: string, services: ServiceInfo[]): string {
        const found = services.find(s => s.service_name === itemName);
        if (found) return found.category;
        
        // Fallback
        const lower = itemName.toLowerCase();
        if (lower.includes('laser') || lower.includes('皮秒')) return 'laser';
        if (lower.includes('botox') || lower.includes('玻尿酸')) return 'inject';
        if (lower.includes('thermage') || lower.includes('電波')) return 'rf';
        if (lower.includes('consult') || lower.includes('諮詢')) return 'consult';
        return 'other';
    }
}
