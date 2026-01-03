// trendEngine.ts
import { AppointmentRecord } from "../data/schema";

// 單筆趨勢資料
export interface TrendItem {
    name: string;
    today: number;
    yesterday: number;
    diff: number;
}

// 趨勢回傳結果
export interface TrendResult {
    today: number;
    yesterday: number;
    diffDay: number;

    week: number;
    lastWeek: number;
    diffWeek: number;

    topTreatmentTrend: TrendItem[];
    topDoctorTrend: TrendItem[];
}

// 計算週次
function getWeekNumber(date: Date): number {
    const onejan = new Date(date.getFullYear(), 0, 1);
    const millisecsInDay = 86400000;
    return Math.ceil((((date.getTime() - onejan.getTime()) / millisecsInDay) + onejan.getDay() + 1) / 7);
}

// 計數 groupBy
function groupCount(list: AppointmentRecord[], field: "service_item" | "doctor_name") {
    const map: Record<string, number> = {};

    list.forEach(a => {
        const key = a[field] || "未填寫";
        map[key] = (map[key] || 0) + 1;
    });

    return map;
}

export function calculateTrends(appointments: AppointmentRecord[]): TrendResult {
    const todayStr = new Date().toISOString().split("T")[0];

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const todayList = appointments.filter(a => a.date === todayStr);
    const yesterdayList = appointments.filter(a => a.date === yesterdayStr);

    const weekNumber = getWeekNumber(new Date());
    const lastWeekNumber = weekNumber - 1;

    const weekList = appointments.filter(a => getWeekNumber(new Date(a.date)) === weekNumber);
    const lastWeekList = appointments.filter(a => getWeekNumber(new Date(a.date)) === lastWeekNumber);

    // 數量變化
    const todayCount = todayList.length;
    const yesterdayCount = yesterdayList.length;

    const weekCount = weekList.length;
    const lastWeekCount = lastWeekList.length;

    // 熱門療程趨勢
    const todayTreatment = groupCount(todayList, "service_item");
    const yesterdayTreatment = groupCount(yesterdayList, "service_item");

    const topTreatmentTrend: TrendItem[] = Object.keys(todayTreatment).map(name => ({
        name,
        today: todayTreatment[name] || 0,
        yesterday: yesterdayTreatment[name] || 0,
        diff: (todayTreatment[name] || 0) - (yesterdayTreatment[name] || 0)
    })).sort((a, b) => b.today - a.today);

    // 醫師預約趨勢
    const todayDoctor = groupCount(todayList, "doctor_name");
    const yesterdayDoctor = groupCount(yesterdayList, "doctor_name");

    const topDoctorTrend: TrendItem[] = Object.keys(todayDoctor).map(name => ({
        name,
        today: todayDoctor[name] || 0,
        yesterday: yesterdayDoctor[name] || 0,
        diff: (todayDoctor[name] || 0) - (yesterdayDoctor[name] || 0)
    })).sort((a, b) => b.today - a.today);

    return {
        today: todayCount,
        yesterday: yesterdayCount,
        diffDay: todayCount - yesterdayCount,

        week: weekCount,
        lastWeek: lastWeekCount,
        diffWeek: weekCount - lastWeekCount,

        topTreatmentTrend,
        topDoctorTrend
    };
}
