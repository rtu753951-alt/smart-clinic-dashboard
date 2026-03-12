import * as fs from 'fs';
import * as path from 'path';

// Mock Browser globals
(global as any).window = { currentDashboardMonth: '2025-11' };
(global as any).fetch = async (url: string) => {
    const filename = url.replace('data/', '').split('?')[0];
    const filepath = path.join(process.cwd(), 'public', 'data', filename);
    const text = fs.readFileSync(filepath, 'utf8');
    return {
        text: async () => text,
        blob: async () => text
    };
};

// Date Mock
const OriginalDate = global.Date;
const FIXED_TIME = new OriginalDate('2025-12-01T00:00:00+08:00').getTime();
global.Date = new Proxy(OriginalDate, {
    construct(target, args) {
        if (args.length === 0) return new target(FIXED_TIME);
        return new target(...(args as any));
    }
}) as any;

(global as any).requestAnimationFrame = (callback: any) => setTimeout(callback, 0);

import { dataStore } from './src/data/dataStore.js';

export async function testDataStore() {
    console.log("Starting debug load...");
    await dataStore.loadBootstrap();
    console.log("Bootstrap finished. Services:", dataStore.services.length, "Staff:", dataStore.staff.length);
    await dataStore.loadAppointments();
    console.log("Appointments loaded. Valid:", dataStore.appointments.length, "Quarantined:", dataStore.quarantinedAppointments.length);
    
    // Check Nov 2025 data
    const novAppts = dataStore.appointments.filter(a => a.date.startsWith('2025-11'));
    console.log("Nov 2025 Valid Appointments:", novAppts.length);
}
