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
     * 優先順序：SessionStorage > LocalStorage > 環境變數 (VITE_GEMINI_KEY)
     * 使用者手動輸入的 Key (存於 Storage) 優先於環境變數，允許覆蓋。
     */
    public getApiKey(): string | null {
        // 1. Session Storage (當次有效)
        const sessionKey = sessionStorage.getItem(this.STORAGE_KEY);
        if (sessionKey && sessionKey.trim() !== '') {
            return sessionKey;
        }

        // 2. Local Storage (持久有效)
        const localKey = localStorage.getItem(this.STORAGE_KEY);
        if (localKey && localKey.trim() !== '') {
            return localKey;
        }

        // 3. 環境變數 (預設值)
        if (import.meta.env && import.meta.env.VITE_GEMINI_KEY) {
            return import.meta.env.VITE_GEMINI_KEY;
        }

        // 4. Backward Compatibility
        if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
            return process.env.GEMINI_API_KEY;
        }

        return null;
    }

    /**
     * 獲取金鑰來源 (用於 UI 顯示狀態)
     */
    public getKeySource(): 'env' | 'localStorage' | 'sessionStorage' | null {
        if (sessionStorage.getItem(this.STORAGE_KEY)) return 'sessionStorage';
        if (localStorage.getItem(this.STORAGE_KEY)) return 'localStorage';
        if ((import.meta.env && import.meta.env.VITE_GEMINI_KEY) || (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY)) return 'env';
        return null;
    }

    /**
     * 儲存使用者設定的金鑰
     * @param key API Key
     * @param remember 是否記住 (True=LocalStorage, False=SessionStorage)
     */
    public setApiKey(key: string, remember: boolean = true): void {
        const trimmed = key.trim();
        if (!trimmed) {
            this.clearApiKey();
            return;
        }

        if (remember) {
            localStorage.setItem(this.STORAGE_KEY, trimmed);
            sessionStorage.removeItem(this.STORAGE_KEY); // Clean other slot
        } else {
            sessionStorage.setItem(this.STORAGE_KEY, trimmed);
            localStorage.removeItem(this.STORAGE_KEY); // Clean other slot
        }
    }

    /**
     * 清除金鑰 (同時清除兩種 Storage)
     */
    public clearApiKey(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        sessionStorage.removeItem(this.STORAGE_KEY);
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
