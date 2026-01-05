import { StaffRecord, ServiceCategory } from "./schema.js";
import { dataStore } from "./dataStore.js";

/**
 * 專項能力映射表 (Skill-to-Service Mapping)
 * 定義：哪些具體項目屬於哪個類別
 * 
 * 用途：
 * 1. 判斷員工證照是否符合該類別需求
 * 2. Sandbox 模擬時，增量僅分配給合規人員
 */
const SKILL_CATEGORY_MAP: Record<string, ServiceCategory> = {
    // Inject (微整/針劑)
    "Botox": "inject",
    "Thread Lift": "inject",
    "Skin Booster": "inject",
    "Mesotherapy": "inject",
    
    // Laser (雷射光療)
    "Pico Laser": "laser",
    "Laser Toning": "laser",
    "Chemical Peel": "laser",
    "Hydra Facial": "laser", // Added based on context, usually therapist
    
    // RF (電音波)
    "Thermage": "rf",
    "Ultherapy": "rf",
    "RF Tightening": "rf",
    
    // Drip (點滴)
    "Whitening Drip": "drip",
    "IV Injection": "drip",

    // Consult (諮詢)
    "Consultation": "consult",
    "Follow-up": "consult"
};

/**
 * 取得服務項目的標準分類
 * 若 Map 中未定義，則嘗試從 DataStore 查找，最後回傳 'other'
 */
export function getServiceCategory(serviceName: string): ServiceCategory {
    // 1. Check Hardcoded Map (Business Logic Source of Truth for Skills)
    if (SKILL_CATEGORY_MAP[serviceName]) {
        return SKILL_CATEGORY_MAP[serviceName];
    }
    
    // 2. Fallback to DataStore
    const service = dataStore.services.find(s => s.service_name === serviceName);
    if (service && service.category) {
        return service.category;
    }

    return "other";
}

/**
 * 解析員工的證照列表，回傳該員工「能執行的所有類別」
 * @param staff 員工資料
 * @returns Set<ServiceCategory> (e.g. {'inject', 'rf'})
 */
export function getStaffCapabilities(staff: StaffRecord): Set<ServiceCategory> {
    const capabilities = new Set<ServiceCategory>();

    if (!staff.certified_services) return capabilities;

    // Split "Botox|Thread Lift" -> ["Botox", "Thread Lift"]
    const certs = staff.certified_services.split('|').map(s => s.trim());
    
    certs.forEach(cert => {
        const cat = getServiceCategory(cert);
        if (cat && cat !== 'other') {
            capabilities.add(cat);
        }
    });

    return capabilities;
}

/**
 * 核心判斷：該員工是否有資格執行此類別的任務？
 * @param staff 
 * @param category 
 */
export function isCertifiedForCategory(staff: StaffRecord, category: ServiceCategory): boolean {
    const caps = getStaffCapabilities(staff);
    return caps.has(category);
}

/**
 * 核心判斷：該員工是否有資格執行此具體服務？
 * @param staff 
 * @param serviceName 
 */
export function isCertifiedForService(staff: StaffRecord, serviceName: string): boolean {
    const category = getServiceCategory(serviceName);
    return isCertifiedForCategory(staff, category);
}
