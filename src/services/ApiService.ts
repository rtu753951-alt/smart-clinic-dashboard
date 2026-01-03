declare var process: any;

export class ApiService {
    private static instance: ApiService;
    private readonly STORAGE_KEY = 'AI_SERVICE_KEY';

    private constructor() {}

    public static getInstance(): ApiService {
        if (!ApiService.instance) {
            ApiService.instance = new ApiService();
        }
        return ApiService.instance;
    }

    /**
     * 獲取 AI 服務金鑰
     * 優先順序：環境變數 (VITE_GEMINI_KEY) > LocalStorage 設定
     */
    public getApiKey(): string | null {
        // 1. 嘗試從環境變數讀取 (Vite Env)
        if (import.meta.env && import.meta.env.VITE_GEMINI_KEY) {
            return import.meta.env.VITE_GEMINI_KEY;
        }

        // 2. 舊版環境變數檢查 (Backup)
        if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
            return process.env.GEMINI_API_KEY;
        }

        // 3. 嘗試從 LocalStorage 讀取 (使用者手動設定)
        const userKey = localStorage.getItem(this.STORAGE_KEY);
        if (userKey && userKey.trim() !== '') {
            return userKey;
        }

        return null;
    }

    /**
     * 檢查是否使用環境變數中的金鑰
     */
    public isUsingEnvKey(): boolean {
        // Check Vite Env
        if (import.meta.env && import.meta.env.VITE_GEMINI_KEY) {
            return true;
        }
        // Check Process Env
        if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
            return true;
        }
        return false;
    }

    /**
     * 儲存使用者設定的金鑰
     */
    public setApiKey(key: string): void {
        localStorage.setItem(this.STORAGE_KEY, key.trim());
    }

    /**
     * 清除金鑰
     */
    public clearApiKey(): void {
        localStorage.removeItem(this.STORAGE_KEY);
    }
    
    /**
     * 校正 API 網址 (Fix 404 Error)
     * 請檢查所有發送至 Google Gemini 的 fetch 網址。
     * 要求：確保網址格式正確（應為 https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=...）。
     */

    /**
     * 獲取報告語氣設定
     * 統一使用 'report_tone' Key
     */
    public getReportTone(): string {
        const tone = localStorage.getItem('report_tone') || 'professional';
        console.log("當前 API 呼叫語氣為:", tone);
        return tone;
    }

    /**
     * 驗證金鑰是否有效 (簡易檢查)
     */
    public hasValidKey(): boolean {
        const key = this.getApiKey();
        return key !== null && key.length > 10;
    }
}

export const apiService = ApiService.getInstance();
