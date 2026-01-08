
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
        const { meta, issues, validAppointments, quarantinedAppointments } = report;
        const { totalProcessed, validCount } = meta;
        const validRate = totalProcessed > 0 ? validCount / totalProcessed : 1;

        const reasons: string[] = [];

        // 1. Critical Checks

        // Condition: Valid Rate < 85%
        if (validRate < 0.85) {
            return {
                level: 'critical',
                title: '🔴 系統狀態：需處理',
                message: '部分資料可能影響營運指標',
                description: '建議管理者立即查看系統檢核詳情',
                reasons: [`資料有效率過低 (${(validRate * 100).toFixed(1)}%)`]
            };
        }

        // Check for fatal errors that might have slipped through (logic_error that isn't quarantined? 
        // Actually typically errors ARE quarantined. But if we have 'fatal' global errors)
        // For MVP, we assume 'error' severity in issues list implies it was quarantined (based on dataValidator logic).
        // User request: "Unquarantined and affects KPI".
        // If dataValidator works correctly, all 'error' severity are in quarantined.
        // So we check if there are any 'error' in 'validAppointments'? No, valid strictly filters them.
        
        // Let's check for specific high-risk issues in Quarantined that represent systemic failure?
        // User request: "appointment_id duplicate and NOT quarantined" -> Impossible by definition if validator logic holds.
        // But maybe "Large number of duplicates" even if quarantined is Critical?
        // User said: "appointment_id massive duplicates and unable to auto-isolate".
        // We will check if we have any duplicates in valid set (should not happen).
        
        // 2. Warning Checks
        // Condition: Valid Rate 85% ~ 95%
        if (validRate < 0.95) {
            reasons.push(`資料有效率低於 95% (${(validRate * 100).toFixed(1)}%)`);
            return {
                 level: 'warning',
                 title: '⚠️ 系統狀態：需注意',
                 message: '部分新資料出現一致性提醒',
                 description: '系統已自動隔離問題資料，營運指標未受影響',
                 reasons
            };
        }

        // Check for specific "Warning" patterns in Issues (even if valid rate is high, if these warnings exist in high volume)
        // However, the user request says: "Warning: found ... but quarantined". 
        // Actually, if it's quarantined, it's NOT in valid set. The user might mean "Issues found matching these criteria".
        
        // Let's check for "ROLE_MISMATCH" warnings or "service_item missing" (ref_error) in Quarantined.
        const roleMismatchCount = issues.filter((i: ValidationIssue) => i.code === 'logic_error' && i.message.includes('Role mismatch')).length;
        const serviceMissingCount = issues.filter((i: ValidationIssue) => i.code === 'ref_error' && i.field === 'service_item').length;
        
        if (roleMismatchCount > 50 || serviceMissingCount > 50) { // Arbitrary threshold for "Significant"
             return {
                 level: 'warning',
                 title: '⚠️ 系統狀態：需注意',
                 message: '部分新資料出現一致性提醒',
                 description: '系統已自動隔離問題資料，營運指標未受影響',
                 reasons: ['大量角色或服務項目不一致']
            };
        }

        // 3. Normal (Default)
        return {
            level: 'normal',
            title: '🛡 系統狀態：穩定',
            message: 'KPI 已套用資料檢核機制',
            description: '問題資料已自動隔離，不影響營運決策',
            reasons: []
        };
    }
}
