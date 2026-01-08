// src/data/apiDataSource.ts
import { AppointmentRecord } from "./schema.js"; // Assuming schema exists

// Feature Flag
export const USE_BACKEND_API = false;

const API_BASE = "http://localhost:3000/api";
// Hardcoded token for demo
const AUTH_HEADER = { "x-admin-token": "secret123" }; 

export class ApiDataSource {
    
    static async ingestStaff(file: Blob): Promise<any> {
        return this.uploadFile(`${API_BASE}/ingest/staff`, file, 'staff.csv');
    }

    static async ingestServices(file: Blob): Promise<any> {
        return this.uploadFile(`${API_BASE}/ingest/services`, file, 'services.csv');
    }

    static async ingestAppointments(file: Blob, mode: 'replace' | 'append' = 'replace'): Promise<any> {
        return this.uploadFile(`${API_BASE}/ingest/appointments?mode=${mode}`, file, 'appointments.csv');
    }

    static async getSystemHealth() {
        if (!USE_BACKEND_API) return null;
        try {
            // Note: In backend routes it might be /health or /system/health depending on implementation
            // User prompt said: GET /api/system/health
            const res = await fetch(`${API_BASE}/system/health`);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    // Existing Query (Optional, for Phase 4 but good to keep structure)
    static async loadAppointments(page: number = 1, pageSize: number = 50000): Promise<AppointmentRecord[]> {
        if (!USE_BACKEND_API) return [];

        try {
            const res = await fetch(`${API_BASE}/appointments?page=${page}&pageSize=${pageSize}`, {
                headers: AUTH_HEADER
            });
            if (!res.ok) throw new Error("API Failed");
            const data = await res.json();
            return data.items || [];
        } catch (e) {
            console.error("Failed to load from API", e);
            throw e;
        }
    }

    private static async uploadFile(url: string, file: Blob, filename: string) {
        if (!USE_BACKEND_API) {
            console.warn("ApiDataSource called but Feature Flag is OFF");
            return { status: 'skipped' };
        }

        const formData = new FormData();
        formData.append("file", file, filename);

        const res = await fetch(url, {
            method: "POST",
            headers: AUTH_HEADER,
            body: formData
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            // Log full error for debug
            console.error("API Error detailed:", err);
            throw new Error(err.message || `API Error: ${res.status}`);
        }
        return await res.json();
    }
}

