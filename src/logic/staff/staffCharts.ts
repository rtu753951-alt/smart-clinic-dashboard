import { AppointmentRecord } from "../../data/schema";
import { dataStore } from "../../data/dataStore";

// --- Types ---
export type BucketId = "12-14" | "14-16" | "16-18" | "18-21";

export interface StaffBucketLoad {
    role: string;
    bucketId: BucketId;
    count: number;
    occupiedMinutes: number;         // Total Duration + Buffer
    occupiedMinutesPerHour: number;  // occupiedMinutes / bucketHours
    avgOccupiedMinPerTask: number;
    minutesSource: "REAL" | "ESTIMATED";
    missingServiceMappingCount: number;
    bucketHours: number;
}

export type StaffHeatmapData = Record<string, Record<BucketId, StaffBucketLoad>>;

const BUCKET_DEFS: { id: BucketId; label: string; hours: number; startH: number; endH: number }[] = [
    { id: "12-14", label: "12:00-14:00", hours: 2, startH: 12, endH: 14 },
    { id: "14-16", label: "14:00-16:00", hours: 2, startH: 14, endH: 16 },
    { id: "16-18", label: "16:00-18:00", hours: 2, startH: 16, endH: 18 },
    { id: "18-21", label: "18:00-21:00", hours: 3, startH: 18, endH: 21 }
];

// --- Data Aggregation ---

// --- Data Aggregation ---

export function calculateStaffHeatmapData(appointments: AppointmentRecord[]): StaffHeatmapData {
    // Initialize container
    const roles = ['doctor', 'nurse', 'therapist', 'consultant']; 
    const data: StaffHeatmapData = {};

    roles.forEach(role => {
        data[role] = {} as Record<BucketId, StaffBucketLoad>;
        BUCKET_DEFS.forEach(b => {
             data[role][b.id] = {
                 role,
                 bucketId: b.id,
                 count: 0,
                 occupiedMinutes: 0,
                 occupiedMinutesPerHour: 0,
                 avgOccupiedMinPerTask: 0,
                 minutesSource: "ESTIMATED", 
                 missingServiceMappingCount: 0,
                 bucketHours: b.hours
             };
        });
    });

    const getBucket = (timeStr: string): BucketId | null => {
        const h = parseInt(timeStr.split(':')[0], 10);
        if (h >= 12 && h < 14) return "12-14";
        if (h >= 14 && h < 16) return "14-16";
        if (h >= 16 && h < 18) return "16-18";
        if (h >= 18 && h < 21) return "18-21";
        return null;
    };

    const staffMap = new Map<string, string>();
    dataStore.staff.forEach(s => {
        if (s.staff_name) staffMap.set(s.staff_name.trim(), s.staff_type.trim());
    });

    // Debug: Track missing services
    const missingLog = new Map<string, { count: number, sample: any }>();
    
    // Log first 3 appointments keys to verify structure
    if (appointments.length > 0) {
        console.group("[APPT_KEYS] First 3 Appointments Inspection");
        appointments.slice(0, 3).forEach((apt, i) => {
            console.log(`#${i}`, Object.keys(apt));
            console.log(`#${i} values`, apt);
        });
        console.groupEnd();
    }

    let processedCount = 0;
    
    appointments.forEach(apt => {
        if (apt.status === 'cancelled' || apt.status === 'no_show') return;

        const bucketId = getBucket(apt.time);
        if (!bucketId) return;

        // B) Valid Aggregation Source: service_item
        const rawName = apt.service_item || "";
        const serviceKey = rawName.trim(); // No Lowercase to check exact match first? Or keep strict as User B said 'Robust'?
        // User asked: "join join key: services.service_name == serviceKey"
        // And "If missing, console.warn".
        // Let's stick to robust matching (trim + casing) usually, but User said "serviceKey = appt.service_item".
        // Let's use case-insensitive matching for safety but log the raw key.
        const helperKey = serviceKey.toLowerCase();

        const service = dataStore.services.find(s => s.service_name.trim().toLowerCase() === helperKey);
        
        // A) Minutes Calculation
        let occupiedMins = 0;
        let isReal = false;

        if (service) {
             // duration + buffer_time
             // Ensure numbers
             occupiedMins = (service.duration || 0) + (service.buffer_time || 0);
             isReal = true;
        } else {
             // Log missing
             const curr = missingLog.get(serviceKey) || { count: 0, sample: apt };
             curr.count++;
             missingLog.set(serviceKey, curr);
        }

        const stats = (role: string) => {
             if (!data[role]) return;
             const cell = data[role][bucketId];
             
             cell.count++; // Always increment count
             processedCount++;

             if (isReal && occupiedMins > 0) {
                 cell.occupiedMinutes += occupiedMins;
                 cell.minutesSource = "REAL"; 
             } else {
                 cell.missingServiceMappingCount++;
                 // Fallback Logic (Estimation) if missing
                 // This causes the "Uniformity" if mostly missing.
                 let fallback = 50;
                 if (role === 'doctor') fallback = 60;
                 if (role === 'nurse') fallback = 30;
                 if (role === 'therapist') fallback = 45;
                 if (role === 'consultant') fallback = 20;
                 cell.occupiedMinutes += fallback;
             }
        };

        if (apt.doctor_name) {
            const r = staffMap.get(apt.doctor_name.trim());
            if (r === 'doctor') stats('doctor');
        }
        if (apt.staff_role) {
            const r = staffMap.get(apt.staff_role.trim());
            if (r) stats(r);
        }
    });

    // ... (previous logic)

    // C) Stats & Logging
    let totalMissing = 0;
    missingLog.forEach(v => totalMissing += v.count);
    
    // Distribution Analysis (Requested by User)
    const usedDurations: number[] = [];
    const usedServiceStats = new Map<string, number>();

    appointments.forEach(apt => {
        if(apt.status === 'cancelled' || apt.status === 'no_show') return;
        const serviceKey = (apt.service_item || "").trim();
        const helperKey = serviceKey.toLowerCase();
        const service = dataStore.services.find(s => s.service_name.trim().toLowerCase() === helperKey);
        
        if (service) {
            const m = (service.duration || 0) + (service.buffer_time || 0);
            usedDurations.push(m);
            const k = `${serviceKey} (${m}m)`;
            usedServiceStats.set(k, (usedServiceStats.get(k) || 0) + 1);
        }
    });

    if (usedDurations.length > 0) {
        usedDurations.sort((a,b) => a-b);
        const p50 = usedDurations[Math.floor(usedDurations.length * 0.5)];
        const p90 = usedDurations[Math.floor(usedDurations.length * 0.9)];
        const uniqueVals = new Set(usedDurations).size;

        console.group("[StaffHeatmap] Duration Distribution Check");
        console.log(`Unique Durations: ${uniqueVals}`);
        console.log(`Stats: Min=${usedDurations[0]}, Max=${usedDurations[usedDurations.length-1]}, P50=${p50}, P90=${p90}`);
        
        const topUsed = Array.from(usedServiceStats.entries())
            .sort((a,b) => b[1] - a[1])
            .slice(0, 10);
        console.table(topUsed);
        
        if (uniqueVals <= 1) {
             console.warn("⚠️ CRITICAL: All services have identical duration! Heatmap will look identical to Count mode.");
        }
        console.groupEnd();
    }

    // ... (existing logging) ...




    // Final Calculations
    roles.forEach(role => {
        BUCKET_DEFS.forEach(b => {
            const cell = data[role][b.id];
            if (cell.count > 0) {
                cell.avgOccupiedMinPerTask = Math.round(cell.occupiedMinutes / cell.count);
                cell.occupiedMinutesPerHour = Math.round(cell.occupiedMinutes / cell.bucketHours);
            }
        });
    });

    return data;
}

// --- Rendering Logic ---



export function renderStaffHeatmap(heatmapData: StaffHeatmapData) {
    const canvas = document.getElementById("staffHeatmap") as HTMLCanvasElement | null;
    if (!canvas) return;

    // Toggle Injection
    let container = canvas.parentElement;
    if (container && !container.querySelector('#heatmap-mode-toggle')) {
        const toggle = document.createElement('div');
        toggle.id = 'heatmap-mode-toggle';
        toggle.style.cssText = "position: absolute; top: 10px; right: 10px; font-size: 0.8rem; background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; z-index: 10;";
        toggle.innerHTML = `<label style="cursor:pointer; display:flex; align-items:center; gap:4px;"><input type="checkbox" id="heatmap-unit-check"> 顯示分鐘數密度 (Minutes Density)</label>`;
        container.style.position = 'relative'; 
        container.appendChild(toggle);
        
        toggle.querySelector('input')?.addEventListener('change', () => {
             renderStaffHeatmap(heatmapData); 
        });
        const inp = toggle.querySelector('input') as HTMLInputElement;
        if(inp) inp.checked = true;
    }

    const isMinutesMode = (document.getElementById('heatmap-unit-check') as HTMLInputElement)?.checked ?? true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if ((window as any).staffHeatmapChart) {
        (window as any).staffHeatmapChart.destroy();
    }

    const roles = Object.keys(heatmapData);

    // 1. Collect Values for Stats (Per Role)
    const roleStats: Record<string, { max: number, p90: number, values: number[] }> = {};

    roles.forEach(role => {
        const values: number[] = [];
        BUCKET_DEFS.forEach(b => {
            const cell = heatmapData[role][b.id];
            // Use correct metric based on mode
            const v = isMinutesMode ? cell.occupiedMinutesPerHour : (cell.count / cell.bucketHours);
            if (v > 0) values.push(v);
        });
        values.sort((a,b) => a-b);
        
        const max = values.length > 0 ? values[values.length-1] : 60; // default 60 to avoid div/0
        const p90Idx = Math.floor(values.length * 0.90);
        const p90 = values.length > 0 ? values[p90Idx] : max;

        roleStats[role] = { max, p90, values };
    });

    const flatData: any[] = [];
    
    // Pass 1: Build Dataset with Enhanced Normalization
    roles.forEach(role => {
        const stats = roleStats[role];
        // Strategy: Use P90 as the "Soft Max" (Cap).
        // If P90 is too low (e.g. sparse data), fallback to a reasonable baseline (e.g. 60m).
        const capV = Math.max(stats.p90, isMinutesMode ? 60 : 1);
        
        BUCKET_DEFS.forEach(bucket => {
            const cell = heatmapData[role][bucket.id];
            
            flatData.push({
                x: bucket.id,
                y: role,
                v: isMinutesMode ? cell.occupiedMinutesPerHour : (cell.count / cell.bucketHours),
                original: cell,
                role: role,
                bucketId: bucket.id,
                capV: capV // Store for tooltip/debug
            });
        });
    });

    // Chart
    (window as any).staffHeatmapChart = new (window as any).Chart(ctx, {
        type: "matrix",
        data: {
            datasets: [{
                label: "Staff Workload",
                data: flatData,
                width: () => 32,
                height: () => 20,
                backgroundColor: (c: any) => {
                    const raw = c.raw; 
                    if (!raw) return 'rgba(0,0,0,0)';
                    
                    const vUsed = raw.v;
                    const capV = raw.capV;
                    
                    // 2. Non-Linear Scale (Sqrt) + Clamping
                    // vClamped = min(vUsed, capV)
                    const vClamped = Math.min(vUsed, capV);
                    
                    // Scale 0..1
                    const ratio = vClamped / capV;
                    
                    // Sqrt Curve to boost low values visibility
                    const scaled = Math.sqrt(ratio);
                    
                    // Alpha Mapping
                    const base = 0.15;
                    const alpha = base + (1 - base) * scaled;

                    // Log Sample (First few or significant ones)
                    // We show one debug log per role-bucket to verify behavior
                    // (Optimized: only log if we haven't flooded console, or just let it log 16 times)
                    
                     console.log("[HEATMAP_COLOR]", {
                        role: raw.role,
                        bucket: raw.bucketId,
                        mode: isMinutesMode ? 'minutesPerHour' : 'countPerHour',
                        vUsed: vUsed,
                        vUsedFrom: isMinutesMode ? 'cell.occupiedMinutesPerHour' : 'cell.count/bucketHours',
                        capV: capV, // Replaces MaxV
                        algo: "Sqrt(v/P90)",
                        alpha: alpha.toFixed(3),
                        alphaSource: `base(${base}) + (1-${base})*sqrt(${vClamped}/${capV})`
                    });

                    return `rgba(0,122,255, ${alpha.toFixed(3)})`;
                },
                borderRadius: 4,
                hoverBackgroundColor: 'rgba(255, 99, 132, 0.8)' 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 20, right: 20 } },
            scales: {
                x: {
                    type: "category",
                    labels: BUCKET_DEFS.map(b => b.id),
                    title: { display: true, text: "時段" },
                    ticks: { callback: (v: any, i: number) => BUCKET_DEFS[i].label }
                },
                y: {
                    type: "category",
                    labels: roles,
                    title: { display: true, text: "角色" }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items: any[]) => {
                            const r = items[0].raw.original as StaffBucketLoad;
                            return `${r.role} @ ${r.bucketId}`;
                        },
                        label: (ctx: any) => {
                            const r = ctx.raw.original as StaffBucketLoad;
                            const vUsed = ctx.raw.v;
                            const capV = ctx.raw.capV;
                            const vClamped = Math.min(vUsed, capV);
                            const ratio = vClamped / capV;
                            const alpha = 0.15 + (0.85 * Math.sqrt(ratio));
                            
                            return [
                                `Mode: ${isMinutesMode ? 'Minutes' : 'Count'}`,
                                `Value: ${vUsed}`,
                                `Cap (P90): ${capV}`,
                                `Ratio: ${ratio.toFixed(2)}`,
                                `Alpha (Sqrt): ${alpha.toFixed(2)}`,
                                `---`,
                                `Count: ${r.count}`,
                                `Occ. Mins: ${r.occupiedMinutes}`,
                                `Missing Maps: ${r.missingServiceMappingCount}`
                            ];
                        }
                    }
                }
            }
        }
    });

    console.groupEnd();
}
