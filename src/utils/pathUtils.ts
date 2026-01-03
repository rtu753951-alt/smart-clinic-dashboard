/**
 * Path Utilities
 * 處理 GitHub Pages 子路徑部署與本地開發的路徑異質性
 */

/**
 * 取得資源的完整路徑
 * 自動判斷是 Vite 開發環境或 GitHub Pages 部署環境
 * 
 * 用法:
 * getAssetPath('data/appointments.csv') 
 * -> '/smart-clinic-dashboard/data/appointments.csv' (Production)
 * -> '/data/appointments.csv' (Dev)
 */
export function getAssetPath(path: string): string {
    // 移除開頭的 ./ 或 / 以確保路徑乾淨
    const cleanPath = path.replace(/^\.?\//, '');
    
    // 使用 Vite 注入的 BASE_URL
    const base = import.meta.env.BASE_URL || '/';
    
    // 確保 base 結尾有 /
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    
    return `${cleanBase}${cleanPath}`;
}
