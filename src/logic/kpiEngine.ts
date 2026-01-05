import type { AppointmentRecord } from "../data/schema.js";
import { sandboxStore } from "../features/sandbox/sandboxStore.js";

// 取得 CSV 最後一天當作今天
function getLatestDate(list: AppointmentRecord[]): string {
    const dates = list.map(a => a.date);
    return dates.sort().reverse()[0];
}

/**
 * 計算本日 KPI
 * 
 * 規則：
 * - 永遠使用系統今日（不受月份選單影響）
 * - 不檢查 selectedMonth
 * - 不檢查 completed_at / created_at
 * - 只計算 date === systemToday 的預約
 */
export function calcTodayKPI(appointments: AppointmentRecord[], staffList: any[] = []) {
    if (appointments.length === 0) {
        return { 
            todayTotal: 0,
            todayShow: 0,
            showRate: 0,
            docCount: 0,
            nurseCount: 0,
            consultantCount: 0
        };
    }

    // 🎯 系統今日（永遠使用實際今天，不受月份選單影響）
    const systemToday = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    
    // 🎯 本日所有預約（不檢查 status）
    const todayAppointments = appointments.filter(a => a.date === systemToday);
    const todayTotal = todayAppointments.length;

    // 🎯 今日到診（completed / checked_in）
    const todayCompleted = todayAppointments.filter(a =>
        a.status === "completed" || a.status === "checked_in"
    );
    const todayShow = todayCompleted.length;

    const showRate = todayTotal === 0 ? 0 : Math.round((todayShow / todayTotal) * 100);

    // 直接從 staff 資料中統計 active 人員（不依賴今日預約）
    let docCount = 0;
    let nurseCount = 0;
    let consultantCount = 0;

    staffList.forEach(s => {
        // 只計算 status === "active" 的人員
        if (s.status !== 'active') return;

        if (s.staff_type === 'doctor') {
            docCount++;
        } else if (s.staff_type === 'nurse' || s.staff_type === 'therapist') {
            nurseCount++;
        } else if (s.staff_type === 'consultant') {
            consultantCount++;
        }
    });

    // Debug 輸出
    console.log('[KPI][Today]', {
        date: systemToday,
        total: todayTotal,
        completed: todayShow,
        showRate: showRate
    });

    return {
        todayTotal,
        todayShow,
        showRate,
        docCount,
        nurseCount,
        consultantCount
    };


}
/**
 * 醫師 Top3 - 月度統計
 * 
 * 規則:
 * - 只計算 staff_type = doctor 的醫師
 * - 只計算 status = completed 的預約
 * - 根據全站月份選單計算
 * - 不包含未來日期
 */
export function getDoctorTop3(appointments: AppointmentRecord[], staffList: any[] = []) {
    // 1. 取得目標月份
    const targetMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    
    // 2. 取得今天日期
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    // 3. 建立醫師名單 (只包含 staff_type = doctor)
    const doctorSet = new Set<string>();
    staffList.forEach(s => {
        if (s.staff_type === 'doctor' && s.staff_name) {
            doctorSet.add(s.staff_name.trim());
        }
    });
    
    // 4. 過濾該月份的 completed 預約
    const monthApps = appointments.filter(apt => {
        if (!apt.date) return false;
        
        const aptDate = new Date(apt.date);
        const aptMonth = apt.date.slice(0, 7);
        
        // 必須是目標月份
        if (aptMonth !== targetMonth) return false;
        
        // 不能超過今天
        if (aptDate > today) return false;
        
        // 只計算 completed
        if (apt.status !== 'completed') return false;
        
        return true;
    });
    
    // 5. 統計各醫師的預約數
    const countMap: Record<string, number> = {};

    monthApps.forEach(a => {
        const doc = a.doctor_name?.trim();
        if (!doc) return;
        
        // 只計算在醫師名單中的
        if (!doctorSet.has(doc)) return;

        if (!countMap[doc]) {
            countMap[doc] = 0;
        }
        countMap[doc]++;
    });

    // 6. 轉成陣列並排序
    const sorted = Object.entries(countMap)
        .sort((a, b) => b[1] - a[1])  // 高到低
        .slice(0, 3);                 // 取 Top3

    return sorted.map(([doctor, count]) => ({
        doctor,
        count
    }));
}

/**
 * 熱門療程 Top3 - 月度統計
 * 
 * 規則:
 * - 只計算 status = completed 的預約
 * - 根據全站月份選單計算
 * - 不包含未來日期
 */
export function getTopTreatments(appointments: AppointmentRecord[]) {
    // 1. 取得目標月份
    const targetMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
    
    // 2. 取得今天日期
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    // 3. 過濾該月份的 completed 預約
    const monthApps = appointments.filter(apt => {
        if (!apt.date) return false;
        
        const aptDate = new Date(apt.date);
        const aptMonth = apt.date.slice(0, 7);
        
        // 必須是目標月份
        if (aptMonth !== targetMonth) return false;
        
        // 不能超過今天
        if (aptDate > today) return false;
        
        // 只計算 completed
        if (apt.status !== 'completed') return false;
        
        return true;
    });
    
    // 4. 統計療程數量
    const map = new Map<string, number>();

    monthApps.forEach(a => {
        if (!a.service_item) return;

        const services = a.service_item.split(";");

        services.forEach(s => {
            const name = s.trim();
            if (!name) return;

            map.set(name, (map.get(name) || 0) + 1);
        });
    });

    // 5. 排序並取 Top3
    return Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
}

/**
 * 診間使用率計算 - 容量制
 * 
 * 規則:
 * - 每個診間每天可用時長: 540 分鐘
 * - 一週 7 天
 * - 計算整個月的數據 (根據全站月份選單)
 * - 排除 no_show 和 cancelled 的預約
 * - 使用 service 的 duration + buffer_time 計算實際使用時長
 * - 只顯示到今天為止的數據
 */
export function calcRoomAndEquipmentUsage(
  appointments: AppointmentRecord[],
  services: any[] = [],
  forceNoSandbox: boolean = false
): { roomUsage: Array<{room: string; usageRate: number}>; equipmentUsage: Array<{equipment: string; usageRate: number}> } {
  
  // 1. 取得目標月份 (從全站選單)
  const targetMonth = (window as any).currentDashboardMonth || new Date().toISOString().slice(0, 7);
  
  // 2. 取得今天日期 (不顯示未來資料)
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  // 3. 過濾該月份的預約 (排除 no_show 和 cancelled, 且不超過今天)
  const monthApps = appointments.filter(apt => {
    if (!apt.date) return false;
    
    const aptDate = new Date(apt.date);
    const aptMonth = apt.date.slice(0, 7);
    
    // 必須是目標月份
    if (aptMonth !== targetMonth) return false;
    
    // 不能超過今天
    if (aptDate > today) return false;
    
    // 排除 no_show 和 cancelled
    if (apt.status === 'no_show' || apt.status === 'cancelled') return false;
    
    return true;
  });
  
  // 4. 建立 service 查詢 map
  const serviceMap = new Map<string, {duration: number; buffer_time: number}>();
  services.forEach(s => {
    if (s.service_name) {
      serviceMap.set(s.service_name, {
        duration: s.duration || 30,
        buffer_time: s.buffer_time || 10
      });
    }
  });
  
  // 5. 累加各診間和設備的使用時長 (分鐘)
  const roomMinutes: Record<string, number> = {};
  const equipMinutes: Record<string, number> = {};
  
  // Determine Sandbox State
  const sbState = forceNoSandbox ? undefined : sandboxStore.getState();
  
  monthApps.forEach(apt => {
    // 查詢 service 資訊
    const svc = serviceMap.get(apt.service_item);
    const duration = svc?.duration || 30;
    const buffer = svc?.buffer_time || 10;
    const totalMinutes = duration + buffer;

    // Sandbox Growth
    // We need service object to know category. `serviceMap` only has duration/buffer.
    // We need to look up full service or refine serviceMap. 
    // Wait, services array is passed in. We can re-find or enhance serviceMap.
    const fullService = services.find(s => s.service_name === apt.service_item);
    let growth = 1;
    if (sbState && sbState.isActive && fullService) {
        let cat = fullService.category;
        // Fallback or mapping? `schema.ts`: "laser" | "inject" | "rf" | "consult" | "drip"
        // Store keys match schema category.
        growth = 1 + (sbState.serviceGrowth[cat as keyof typeof sbState.serviceGrowth] || 0);
    }
    
    const finalMinutes = totalMinutes * growth;
    
    // 累加診間使用時長
    if (apt.room && apt.room.trim()) {
      const room = apt.room.trim();
      roomMinutes[room] = (roomMinutes[room] || 0) + finalMinutes;
    }
    
    // 累加設備使用時長
    if (apt.equipment && apt.equipment.trim()) {
      const equip = apt.equipment.trim();
      equipMinutes[equip] = (equipMinutes[equip] || 0) + finalMinutes;
    }
  });
  
  // 6. 計算該月份的工作天數 (到今天為止)
  const [year, month] = targetMonth.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // 該月最後一天
  
  // 實際計算天數: 從月初到 min(月底, 今天)
  const effectiveEnd = monthEnd < today ? monthEnd : today;
  
  // 計算天數差
  const daysDiff = Math.floor((effectiveEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const workingDays = Math.max(1, daysDiff); // 至少1天
  
  // 7. 計算容量 (每天 540 分鐘 × 工作天數)
  const capacityMinutes = 540 * workingDays;
  
  // 8. 計算使用率
  const roomUsage = Object.keys(roomMinutes).map(room => ({
    room,
    usageRate: Math.min(100, Math.round((roomMinutes[room] / capacityMinutes) * 100))
  }));
  
  const equipmentUsage = Object.keys(equipMinutes).map(equipment => ({
    equipment,
    usageRate: Math.min(100, Math.round((equipMinutes[equipment] / capacityMinutes) * 100))
  }));
  
  return { roomUsage, equipmentUsage };
}
