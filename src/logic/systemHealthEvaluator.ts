
import { ValidationReport, ValidationIssue } from "./dataValidator";

export type SystemHealthLevel = 'normal' | 'warning' | 'critical';

export interface SystemHealthStatus {
    level: SystemHealthLevel;
    title: string;
    message: string;
    description: string;
    reasons: string[];
}

/**
 * System Health Evaluator
 * 
 * Rules:
 * - Normal: Valid >= 95%, No unquarantined errors. Warnings limited to benign types.
 * - Warning: Valid 85-95%, or specific consistency warnings (even if quarantined).
 * - Critical: Valid < 85%, or Critical unquarantined errors (e.g. fatal logic failures).
 */
export class SystemHealthEvaluator {

    static evaluate(report: ValidationReport): SystemHealthStatus {
        const { meta } = report;
        const { totalProcessed, quarantineCount } = meta;
        
        const quarantineRate = totalProcessed > 0 ? quarantineCount / totalProcessed : 0;
        // const reasons: string[] = []; // Not really used in UI currently

        // 1. Critical (>= 1%) - Red
        // Meaning: System is actively protecting data integrity by isolating bad data.
        if (quarantineRate >= 0.01) {
             return {
                level: 'critical',
                title: '資料品質風控中',
                message: '異常資料已隔離',
                description: `系統已主動隔離部分不符合規則的資料，分析僅使用已驗證資料。`,
                reasons: [`隔離率偏高 (${(quarantineRate * 100).toFixed(1)}%)`]
            };
        }

        // 2. Warning (>= 0.1%) - Yellow
        // Meaning: Small amount of issues, handled gracefully.
        if (quarantineRate >= 0.001) {
             return {
                level: 'warning',
                title: '需留意部分資料',
                message: '部分資料需留意',
                description: `少量資料未通過檢核，系統已自動隔離，不影響整體分析。`,
                reasons: [`少量資料被隔離`]
             };
        }

        // 3. Normal - Green
        return {
            level: 'normal',
            title: '資料品質良好',
            message: '資料正常',
            description: '目前資料皆通過驗證，分析結果可信。',
            reasons: []
        };
    }
}
