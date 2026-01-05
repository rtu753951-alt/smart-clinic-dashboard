
import { AppointmentRecord, ServiceInfo } from "../../data/schema.js";
import { SandboxState } from "../../features/sandbox/sandboxStore.js";

/**
 * 計算一組預約的總營收
 * 支援 Sandbox 模擬邏輯
 */
export function calculateRevenue(
    appointments: AppointmentRecord[], 
    services: ServiceInfo[],
    sandboxState?: SandboxState
): number {
    return appointments.reduce((sum, apt) => {
        const service = services.find(s => s.service_name === apt.service_item);
        if (!service) return sum;

        let price = service.price || 0;

        // Sandbox Simulation Logic
        if (sandboxState && sandboxState.isActive) {
            // Apply Growth Factor to Price (Equivalent to applying to Quantity)
            // Revenue = Price * Quantity * (1 + Growth)
            // Here we iterate Quantity (appointments), so we multiply Price by Growth
            
            let category = service.category;
            // Fallback category logic if needed (Assuming service.category exists and matches store keys)
            // If category is missing or not in store, default to 0 growth
            const growth = sandboxState.serviceGrowth[category as keyof typeof sandboxState.serviceGrowth] || 0;
            
            price = price * (1 + growth);
        }

        return sum + price;
    }, 0);
}
