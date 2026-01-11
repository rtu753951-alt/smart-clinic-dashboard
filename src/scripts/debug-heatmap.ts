
import { calculateStaffHeatmapData } from "../logic/staff/staffCharts";
import { dataStore } from "../data/dataStore";
import * as fs from 'fs';
import * as path from 'path';

// Define types locally if needed or rely on robust any casting for debug
// StaffHeatmapData, BUCKET_DEFS are internal to staffCharts but result is returned.
// We can assume result structure matches what we expect since we import the function.

async function runDebug() {
    console.log("--- DEBUG START ---");
    
    // Capture logs
    const logs: string[] = [];
    const log = (...args: any[]) => {
        console.log(...args);
        args.forEach((a: any) => {
             const str = typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);
             logs.push(str);
        });
    };
    
    try {
        log("--- DEBUG START ---");
        
        // Robust CSV Parser (Regex handles quotes)
        const csvParse = (input: string) => {
            const cleanInput = input.replace(/^\uFEFF/, '');
            const lines = cleanInput.split('\n').filter((l: string) => l.trim());
            if (lines.length === 0) return [];

            const headers = lines[0].split(',').map((h: string) => h.trim());
            const re = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
            
            return lines.slice(1).map((line: string) => {
                const values = line.split(re).map((v: string) => v.trim().replace(/^"|"$/g, ''));
                const obj: any = {};
                headers.forEach((h: string, i: number) => {
                    obj[h] = values[i] || "";
                });
                return obj;
            });
        };

        const root = 'd:/Backup/clinic_dashboard_ai/public/data';
        
        // 1. Load Services
        const rawServices = csvParse(fs.readFileSync(path.join(root, 'services.csv'), 'utf8'));
        dataStore.services = rawServices.map((r: any) => ({
            service_name: r.service_name,
            category: r.category as any,
            price: Number(r.price),
            duration: Number(r.duration_min || r.duration || 10),
            buffer_time: Number(r.buffer_time || r.buffer || 0),
            executor_role: r.executor_role || '',
            intensity: r.intensity_level || ''
        })) as any[]; // Cast to any[] to avoid strict type checks in debug script
        log(`Loaded ${dataStore.services.length} services.`);

        // 2. Load Appointments
        const rawAppts = csvParse(fs.readFileSync(path.join(root, 'appointments.csv'), 'utf8'));
        log(`Total Raw Appointments: ${rawAppts.length}`);
        
        const appointments = rawAppts.slice(0, 2000).map((r: any) => ({
            appointment_id: r.appointment_id,
            date: r.date,
            time: r.time,
            service_item: r.service_item,
            doctor_name: r.doctor_name,
            staff_role: r.staff_role as any,
            status: (r.status || 'completed') as any
        }));
        log("First Appointment Parsed:", JSON.stringify(appointments[0]));

        // 3. Load Staff
        const rawStaff = csvParse(fs.readFileSync(path.join(root, 'staff.csv'), 'utf8'));
        dataStore.staff = rawStaff.map((r: any) => ({
            staff_name: r.staff_name,
            staff_type: r.staff_type as any,
            specialty: r.specialty,
            status: r.status
        })) as any[];
        log(`Loaded ${dataStore.staff.length} staff.`);

        // 4. Run Calc Logic
        // Explicitly cast to any to resolve interface mismatch (missing customer, age, etc in debug data)
        const result: any = calculateStaffHeatmapData(appointments as any);

        // 5. Distribution Stats Check
        const usedDurations: number[] = [];
        appointments.forEach((apt: any) => {
            const key = (apt.service_item || "").trim();
            if (!key) return;
            const s = dataStore.services.find(svc => svc.service_name.trim().toLowerCase() === key.toLowerCase());
            if (s) {
                const m = (s.duration || 0) + (s.buffer_time || 0);
                usedDurations.push(m);
            }
        });

        if (usedDurations.length > 0) {
            usedDurations.sort((a,b) => a-b);
            const p50 = usedDurations[Math.floor(usedDurations.length * 0.5)];
            const p90 = usedDurations[Math.floor(usedDurations.length * 0.9)];
            const uniqueVals = new Set(usedDurations).size;
            log(`[Distribution] Unique: ${uniqueVals}, Min=${usedDurations[0]}, Max=${usedDurations[usedDurations.length-1]}, P50=${p50}, P90=${p90}`);
        }
        
        // 6. Verification: Simulate Rendering (P90 Cap + Sqrt)
        log("--- SIMULATED RENDER LOGS (Minutes Mode) ---");

        const roles = ['doctor', 'nurse', 'therapist', 'consultant'];
        
        // 6a. Calculate Per-Role P90
        const roleStats: Record<string, { max: number, p90: number, values: number[] }> = {};
        roles.forEach((role: string) => {
            const values: number[] = [];
            if (result[role]) {
                Object.keys(result[role]).forEach((bucket: string) => {
                    // cast bucket to any to avoid "string cannot index..." index signature error
                    const cell = result[role][bucket];
                    // We simulate "Minutes Mode"
                    const v = cell.occupiedMinutesPerHour;
                    if (v > 0) values.push(v);
                });
            }
            values.sort((a,b) => a-b);
            const max = values.length > 0 ? values[values.length-1] : 60;
            const p90Idx = Math.floor(values.length * 0.90);
            const p90 = values.length > 0 ? values[p90Idx] : max;
            roleStats[role] = { max, p90, values };
        });

        let logCount = 0;
        const alphaVals: number[] = [];
        
        roles.forEach((role: string) => {
            const stats = roleStats[role];
            // Strategy: Use P90 as the "Soft Max" (Cap).
            const capV = Math.max(stats.p90, 60);

            if (result[role]) {
                Object.keys(result[role]).forEach((bucket: string) => {
                    const cell = result[role][bucket];
                    if (!cell) return;
                    
                    const vUsed = cell.occupiedMinutesPerHour;
                    if (vUsed === 0) return;

                    // 2. Non-Linear Scale (Sqrt) + Clamping
                    const vClamped = Math.min(vUsed, capV);
                    const ratio = vClamped / capV;
                    const scaled = Math.sqrt(ratio);
                    const base = 0.15;
                    const alpha = base + (1 - base) * scaled;
                    
                    alphaVals.push(alpha);

                    if (logCount < 5) { 
                        const logObj = {
                            role: cell.role,
                            bucket: cell.bucketId,
                            mode: 'minutesPerHour',
                            vUsed: vUsed,
                            capV: capV,
                            algo: "Sqrt",
                            alpha: alpha.toFixed(3)
                        };
                        log("[HEATMAP_COLOR]", JSON.stringify(logObj));
                        logCount++;
                    }
                });
            }
        });

        // 7. Alpha Stats
        if (alphaVals.length > 0) {
            alphaVals.sort((a,b) => a-b);
            const p50 = alphaVals[Math.floor(alphaVals.length * 0.5)];
            const p90 = alphaVals[Math.floor(alphaVals.length * 0.9)];
            log(`[VERIFICATION] Alpha Stats: Min=${alphaVals[0].toFixed(3)}, Max=${alphaVals[alphaVals.length-1].toFixed(3)}, P50=${p50.toFixed(3)}, P90=${p90.toFixed(3)}`);
        } else {
            log("[VERIFICATION] No Alpha values computed (no data?)");
        }

    } catch (e) {
        log("CRITICAL ERROR:", e);
    } finally {
        fs.writeFileSync(path.join('d:/Backup/clinic_dashboard_ai', 'debug_output_final.txt'), logs.join('\n'), 'utf8');
        console.log("Debug output written.");
    }
}

runDebug();
