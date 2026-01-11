/**
 * External Intelligence Service
 * 外部智慧感知服務 - 負責監控法規變動與天災行銷機會
 * 
 * Future Integration:
 * - Crawler/API for MOHW (Ministry of Health and Welfare)
 * - Weather API / Earthquake API
 */

import { TaskStore } from "../data/taskStore.js";
import { apiService } from "./ApiService.js";

// Google Gemini API Configuration (V1beta)
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface ExternalAlert {
    type: 'regulation' | 'disaster' | 'market';
    level: 'info' | 'warning' | 'critical' | 'error';
    title: string;
    message: string;
    actionLabel?: string;
    actionLink?: string;
    date: string;
}

interface CacheEntry {
    data: any;
    expiry: number;
}

class ExternalIntelligenceService {
    private static instance: ExternalIntelligenceService;
    
    // 敏感詞庫 (法規監測)
    private readonly SENSITIVE_KEYWORDS = ['第一', '頂級', '永久', '根除', '神效', '完全', '保證', '首創', '唯一', '治療', '治癒', '最'];
    private readonly STORAGE_KEY = 'EXTERNAL_INTELLIGENCE_CACHE';
    
    // 快取機制 (In-memory)
    private requestCache = new Map<string, CacheEntry>();
    private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    private constructor() {}

    public static getInstance(): ExternalIntelligenceService {
        if (!ExternalIntelligenceService.instance) {
            ExternalIntelligenceService.instance = new ExternalIntelligenceService();
        }
        return ExternalIntelligenceService.instance;
    }

    /**
     * 檢查是否有新的外部警示
     */
    public async checkActiveAlerts(forceRefresh = false): Promise<ExternalAlert[]> {
        const cached = localStorage.getItem(this.STORAGE_KEY);
        if (cached && !forceRefresh) {
            try {
                const { timestamp, alerts } = JSON.parse(cached);
                const isFresh = (new Date().getTime() - timestamp) < (60 * 60 * 1000); // 1 hour
                if (isFresh) {
                    const liveRegAlert = this.checkRegulationCompliance();
                    const nonRegAlerts = alerts.filter((a: ExternalAlert) => a.type !== 'regulation');
                    if (liveRegAlert) nonRegAlerts.push(liveRegAlert);
                    return nonRegAlerts;
                }
            } catch (e) {
                console.warn('[External Intelligence] Cache parse failed');
            }
        }

        const alerts: ExternalAlert[] = [];
        const regulationAlert = this.checkRegulationCompliance();
        if (regulationAlert) alerts.push(regulationAlert);
        
        const eventAlerts = await this.checkCurrentEventsAndWeather();
        alerts.push(...eventAlerts);

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            timestamp: new Date().getTime(),
            alerts: alerts
        }));

        return alerts;
    }

    /**
     * 獲取可用模型列表 (Internal Helper)
     */
    private async listModels(apiKey: string): Promise<any[]> {
        const url = `${BASE_URL}/models?key=${apiKey}`;
        try {
            const response = await fetch(url, { method: 'GET' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error("[Gemini] List Models Failed:", error);
            throw error;
        }
    }

    /**
     * Helper to pick best model from list
     */
    private pickDefaultModel(models: any[]): string {
        const contentModels = models.filter((m: any) => 
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
        );
        
        if (contentModels.length === 0) return "";

        // Priority List
        const priority = [
            "models/gemini-flash-lite-latest",
            "models/gemini-2.0-flash-lite",
            "models/gemini-flash-latest",
            "models/gemini-2.0-flash",
            "models/gemini-1.5-flash",
            "models/gemini-pro-latest"
        ];

        for (const p of priority) {
            const match = contentModels.find((m: any) => m.name === p);
            if (match) return match.name;
        }

        // Fallback to first available
        return contentModels[0].name;
    }

    /**
     * 測試 API 連線 (使用 models.list)
     * 成功時會自動儲存偏好模型名稱
     */
    /**
     * 測試 API 連線 (使用 models.list) - [Enhanced] 非阻塞與超時保護
     * 成功時會自動儲存偏好模型名稱
     */
    public async testConnectivity(providedKey?: string): Promise<{ success: boolean; message: string; model?: string }> {
        let key = providedKey || apiService.getApiKey();
        if (!key) key = localStorage.getItem('AI_SERVICE_KEY');
        
        // 1. 若無 Key，直接判定 Disabled (不打 API)
        if (!key) return { success: false, message: '未設定 API Key (離線模式)' };

        console.log("[Gemini] Testing connectivity (Lite Mode)...");

        // Helper: Fetch with Timeout
        const fetchWithTimeout = async (retryCount = 0): Promise<any> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s Timeout

            try {
                const models = await this.listModels(key!);
                clearTimeout(timeoutId);
                return models;
            } catch (error: any) {
                clearTimeout(timeoutId);
                
                // Retry Logic (Max 1 retry)
                if (retryCount < 1 && (error.name === 'AbortError' || error.message.includes('fetch'))) {
                    console.warn(`[Gemini] Connection retry... (${retryCount + 1}/1)`);
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s
                    return fetchWithTimeout(retryCount + 1);
                }
                throw error;
            }
        };

        try {
            const models = await fetchWithTimeout();
            const preferredName = this.pickDefaultModel(models);

            if (preferredName) {
                localStorage.setItem("GEMINI_PREFERRED_MODEL", preferredName);
                console.log("[Gemini] Connection Verified. Model:", preferredName);
                return { success: true, message: `連線成功 (${preferredName})`, model: preferredName };
            } else {
                return { success: false, message: '連線成功但無可用模型' };
            }

        } catch (e: any) {
            let msg = e.message || String(e);
            console.warn("[Gemini] Connectivity Test Failed:", msg);
            
            // 轉譯錯誤訊息
            if (e.name === 'AbortError') msg = "連線逾時 (Timeout)";
            else if (msg.includes("401") || msg.includes("403")) msg = "無效的 API Key";
            else if (msg.includes("429")) msg = "請求過多 (429)";
            else if (msg.includes("Failed to fetch")) msg = "網路連線異常";
            
            return { success: false, message: msg };
        }
    }

    // 新增狀態變數 (Rate Limiting & De-dup)
    private inflightRequests = new Map<string, Promise<any>>();
    private cooldownUntil = 0;

    public async analyzeMarketingText(text: string, tone: 'professional' | 'warm' | 'aggressive' = 'professional', bypassCache: boolean = false): Promise<{ isSafe: boolean; suggestion: string }> {
        // 1. Check Key
        let apiKey = apiService.getApiKey();
        if (!apiKey) apiKey = localStorage.getItem('AI_SERVICE_KEY');
        
        if (!apiKey) {
            const hasSensitive = this.SENSITIVE_KEYWORDS.some(k => text.includes(k));
            return {
                isSafe: !hasSensitive,
                suggestion: hasSensitive ? '偵測到敏感詞，建議人工審閱法規。' : ''
            };
        }

        // 2. Normalize Tone
        const t1 = localStorage.getItem('report_tone');
        const t2 = localStorage.getItem('config_ai_tone');
        const rawTone = (t1 && t1.trim()) ? t1.trim() : ((t2 && t2.trim()) ? t2.trim() : 'professional');
        
        let toneParam: 'warm' | 'aggressive' | 'professional' = 'professional';
        const lowerTone = rawTone.toLowerCase();
        
        if (['warm', 'friendly', '溫暖親切', '溫暖親切 (warm)'].some(k => lowerTone.includes(k))) {
            toneParam = 'warm';
        } else if (['aggressive', 'sales', '強硬'].some(k => lowerTone.includes(k))) {
            toneParam = 'aggressive';
        }
        
        // 3. Model Fallback & Selection
        let modelName = localStorage.getItem("GEMINI_PREFERRED_MODEL");
        if (!modelName || modelName === "undefined") {
            modelName = "models/gemini-1.5-flash"; 
        }

        // 4. Cache & Inflight Key
        const cacheKey = `${modelName}_${toneParam}_${text}_${bypassCache}`;
        
        if (this.inflightRequests.has(cacheKey)) {
            return this.inflightRequests.get(cacheKey)!;
        }

        if (!bypassCache) {
            const cached = this.requestCache.get(cacheKey);
            const isCooldown = Date.now() < this.cooldownUntil;
            if (cached && (cached.expiry > Date.now() || isCooldown)) {
                return {
                    ...cached.data,
                    suggestion: isCooldown ? `(AI冷卻中，顯示歷史結果) ${cached.data.suggestion}` : cached.data.suggestion
                };
            }
            if (isCooldown) {
                const remaining = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
                return { isSafe: true, suggestion: `⚠️ 請求太頻繁，請稍候 ${remaining} 秒再試` };
            }
        }

        // 5. Execution Wrapper
        const requestPromise = (async () => {
            try {
                // Prepare Instruction
                const sLevel = localStorage.getItem('config_ai_sensitivity') || 'medium';
                let sensitivityInstr = "";
                if (sLevel === 'high') {
                    sensitivityInstr = "[絕對優先指令：嚴格模式] 請以最高標準審視，任何些微誇大、模糊地帶或未經證實的宣稱都必須列為違規。寧可誤殺不可放過。\n";
                } else if (sLevel === 'low') {
                    sensitivityInstr = "[絕對優先指令：寬鬆模式] 請極度放寬審核標準。除非涉及嚴重醫療宣稱或直接觸法，否則請回報『無風險』或僅做輕微口頭提醒。一般的行銷修辭與形容詞可以容忍，不需過度矯正。\n";
                } else {
                    sensitivityInstr = "[絕對優先指令：平衡模式] 請依照一般醫療廣告實務標準審核，兼顧創意與法規，僅針對具體違規事項提出建議。\n";
                }

                let systemPersonaText = ""; 
                if (toneParam === 'warm') {
                    systemPersonaText = sensitivityInstr + "你現在是一個極度親切、幽默且愛用 Emoji 的醫美顧問，請用吐槽好朋友的方式來分析內容。絕對不要表現得太專業！語氣要像在聊八卦一樣輕鬆。";
                } else if (toneParam === 'aggressive') {
                    systemPersonaText = sensitivityInstr + "你現在是一個極度嚴厲的法規稽核員，請用警告且具威脅性的口吻指出罰款風險。使用驚嘆號！強調若不修改將面臨重罰！";
                } else {
                    systemPersonaText = sensitivityInstr + "你是台灣專業的醫美法規專家。請客觀、冷靜地檢查文案是否違規 (誇大/保證/第一/根治)，並引用法規精神給予建議。";
                }

                const userPrompt = `
請分析以下文案：
"${text}"

回應要求：
1. 僅回傳 JSON 格式：{ "violation": boolean, "suggestion": "你的建議內容" }
2. suggestion 欄位請嚴格遵守 System Instruction 的語氣設定。`;

                const requestBody = {
                    systemInstruction: { parts: [{ text: systemPersonaText }] },
                    contents: [{ parts: [{ text: userPrompt }] }]
                };

                let currentModel = modelName!;
                for (let attempt = 0; attempt < 2; attempt++) {
                    const url = `${BASE_URL}/${currentModel}:generateContent?key=${apiKey}`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });

                    // 429 Handling
                    if (response.status === 429) {
                        this.cooldownUntil = Date.now() + 30000;
                        console.error("[Gemini] 429 Too Many Requests -> Triggering 30s Global Cooldown");
                        return { isSafe: false, suggestion: "⚠️ 請求太頻繁，請稍候 30 秒再試" };
                    }

                    // 404 Handling
                    if (response.status === 404 && attempt === 0) {
                        try {
                            const models = await this.listModels(apiKey!);
                            const newModel = this.pickDefaultModel(models);
                            if (newModel) {
                                currentModel = newModel;
                                localStorage.setItem("GEMINI_PREFERRED_MODEL", newModel);
                                continue; 
                            }
                        } catch (e) {}
                    }

                    if (!response.ok) {
                        if (response.status === 400 && requestBody.systemInstruction) {
                            const fallbackPrompt = `[System: ${systemPersonaText}]\n\n${userPrompt}`;
                            const fbRes = await fetch(url, {
                                 method: 'POST',
                                 headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({ contents: [{ parts: [{ text: fallbackPrompt }] }] })
                            });
                            if (fbRes.ok) {
                                const data = await fbRes.json();
                                return this.processApiResponse(data, cacheKey);
                            }
                        }
                        throw new Error(`HTTP ${response.status} ${response.statusText}`);
                    }

                    const data = await response.json();
                    return this.processApiResponse(data, cacheKey);
                }
                
                return { isSafe: true, suggestion: "請求失敗 (404/Retry Error)" };

            } catch (e: any) {
                console.error("[Gemini] Request Failed:", e);
                return { isSafe: true, suggestion: "AI 服務暫時無法使用" };
            } finally {
                this.inflightRequests.delete(cacheKey);
            }
        })();

        this.inflightRequests.set(cacheKey, requestPromise);
        return requestPromise;
    }

    private processApiResponse(data: any, cacheKey: string): { isSafe: boolean; suggestion: string } {
        // === 強制提取文字 (Force Text Extraction) ===
        let extractedText: string | null = null;
        
        // 1. 嘗試標準路徑
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            extractedText = data.candidates[0].content.parts[0].text;
        } 
        // 2. 嘗試扁平結構 (Fallback)
        else if (typeof data.suggestion === 'string') {
            extractedText = data.suggestion;
        }
        // 3. 嘗試直接將物件轉字串 (除錯用)
        else {
            extractedText = JSON.stringify(data);
        }

        if (!extractedText) extractedText = "無回應內容";

        // === 解析 JSON 回應 ===
        const cleanText = extractedText.replace(/```json/g, '').replace(/```/g, '').trim();
        let outputJson: any = {};
        let finalContent = "";

        try {
            outputJson = JSON.parse(cleanText);
            // 優先使用 json 內的 suggestion
            if (outputJson.suggestion) {
                finalContent = typeof outputJson.suggestion === 'string' ? outputJson.suggestion : JSON.stringify(outputJson.suggestion);
            } else if (outputJson.content) {
                finalContent = typeof outputJson.content === 'string' ? outputJson.content : JSON.stringify(outputJson.content);
            } else {
                // JSON 內沒有預期欄位，直接顯示整個 JSON
                finalContent = cleanText;
            }
        } catch (e) {
            // 非 JSON 格式，直接視為純文字建議
            outputJson = { violation: false };
            finalContent = cleanText;
        }
        
        // 雙重保險：絕對不顯示 [object Object]
        if (typeof finalContent !== 'string') {
            finalContent = JSON.stringify(finalContent);
        }
        if (finalContent === '[object Object]') {
            finalContent = "AI 回應格式錯誤 (Object)";
        }

        console.log("最終準備顯示的文字內容:", finalContent);

        // 強制風險等級同步 (Severity Override)
        let isSafe = !outputJson.violation;
        if (finalContent.includes("違規") || finalContent.includes("罰款") || finalContent.includes("風險") || finalContent.includes("禁止")) {
            isSafe = false;
        }

        const output = {
            isSafe: isSafe,
            suggestion: finalContent
        };

        // Cache Result
        this.requestCache.set(cacheKey, {
            data: output,
            expiry: Date.now() + this.CACHE_TTL
        });

        return output;
    }

    private checkRegulationCompliance(): ExternalAlert | null {
        const tasks = TaskStore.getTasks();
        const pendingTasks = tasks.filter(t => t.status === 'pending');
        const riskTasks = pendingTasks.filter(task => 
            this.SENSITIVE_KEYWORDS.some(keyword => task.title.includes(keyword))
        );

        if (riskTasks.length > 0) {
            return {
                type: 'regulation',
                level: 'error',
                title: '⚖️ 合規建議',
                message: `偵測到 ${riskTasks.length} 個任務包含敏感關鍵字，建議核對法規。`,
                actionLabel: '檢視規範',
                date: new Date().toISOString()
            };
        }
        return null;
    }

    private async checkCurrentEventsAndWeather(): Promise<ExternalAlert[]> {
        const alerts: ExternalAlert[] = [];
    
        const now = new Date();
    
        // TODO: 改成你的診所緯度/經度（或改成從設定檔讀）
        const latitude = 25.0478;
        const longitude = 121.5319;
    
        let uvNow: number | null = null;
        let uvMaxToday: number | null = null;
    
        let humidityNow: number | null = null;
        let dewPointNow: number | null = null;
        let tempNow: number | null = null;
        let apparentTempNow: number | null = null;
        let windNow: number | null = null;
        let precipitationNow: number | null = null;
    
        try {
            // 一次取：目前 UV / 濕度 / 溫度 / 體感溫度 / 露點 / 風速 / 降雨 + 今日最大 UV
            const url =
                `https://api.open-meteo.com/v1/forecast` +
                `?latitude=${latitude}&longitude=${longitude}` +
                `&current=uv_index,relative_humidity_2m,temperature_2m,apparent_temperature,dew_point_2m,wind_speed_10m,precipitation` +
                `&daily=uv_index_max` +
                `&timezone=Asia%2FTaipei&forecast_days=1`;
    
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
    
            const data = await res.json() as any;
    
            // current（目前）
            uvNow = (typeof data?.current?.uv_index === "number") ? data.current.uv_index : null;
            humidityNow = (typeof data?.current?.relative_humidity_2m === "number") ? data.current.relative_humidity_2m : null;
            tempNow = (typeof data?.current?.temperature_2m === "number") ? data.current.temperature_2m : null;
            apparentTempNow = (typeof data?.current?.apparent_temperature === "number") ? data.current.apparent_temperature : null;
            dewPointNow = (typeof data?.current?.dew_point_2m === "number") ? data.current.dew_point_2m : null;
            windNow = (typeof data?.current?.wind_speed_10m === "number") ? data.current.wind_speed_10m : null;
            precipitationNow = (typeof data?.current?.precipitation === "number") ? data.current.precipitation : null;
    
            // daily（今日最大）— 回傳陣列，取第 0 筆
            uvMaxToday = (typeof data?.daily?.uv_index_max?.[0] === "number") ? data.daily.uv_index_max[0] : null;
    
        } catch (e) {
            console.warn("[ExternalIntelligence] Weather data unavailable:", e);
            // 拿不到資料就直接回傳空 alerts（避免假警報）
            return alerts;
        }
    
        // -------------------------
        // ☀️ UV 預警（優先用今日最大）
        // -------------------------
        const uvForAlert = uvMaxToday ?? uvNow;
    
        if (uvForAlert != null && uvForAlert > 7) {
            alerts.push({
                type: 'market',
                level: 'warning',
                title: `☀️ 高 UV 預警 (UV ${Math.round(uvForAlert)})`,
                message: uvMaxToday != null
                    ? '今日紫外線可能達過量級，建議加強術後防曬衛教。'
                    : '目前紫外線偏高，建議加強術後防曬衛教。',
                actionLabel: '發送衛教',
                date: now.toISOString()
            });
        }
    
        // -------------------------
        // 💧 乾燥提醒（濕度為主，風大加強提示）
        // -------------------------
        if (humidityNow != null) {
            const isVeryDry = humidityNow < 30; // 乾燥警示
            const isDry = humidityNow < 40;     // 偏乾提醒
    
            if (isVeryDry || isDry) {
                const windHint = (windNow != null && windNow >= 20) ? '（風偏大，體感更乾）' : '';
                const dewHint = (dewPointNow != null) ? `（露點 ${Math.round(dewPointNow)}°C）` : '';
    
                alerts.push({
                    type: 'market',
                    level: 'warning',
                    title: `💧 乾燥提醒 (濕度 ${Math.round(humidityNow)}%)`,
                    message: `目前環境偏乾${windHint}${dewHint}，建議加強保濕修護、減少刺激性保養與過度清潔。`,
                    actionLabel: '發送保濕衛教',
                    date: now.toISOString()
                });
            }
        }
    
        // -------------------------
        // 🥶 寒冷/寒流提醒（用體感溫度更符合感受）
        // -------------------------
        const coldRef = (apparentTempNow ?? tempNow);
        if (coldRef != null) {
            const isVeryCold = coldRef <= 12;
            const isCold = coldRef <= 16;
    
            if (isVeryCold || isCold) {
                const tLabel = apparentTempNow != null ? '體感' : '氣溫';
                const tValue = Math.round(coldRef);
                const windHint = (windNow != null && windNow >= 20) ? '，且風偏大' : '';
    
                alerts.push({
                    type: 'market',
                    level: 'warning',
                    title: `🥶 低溫提醒 (${tLabel} ${tValue}°C)`,
                    message: `目前${tLabel}偏低${windHint}，建議術後加強保濕修護與防風保暖，避免冷風直吹與過度清潔。`,
                    actionLabel: '發送修護衛教',
                    date: now.toISOString()
                });
            }
        }
    
        // -------------------------
        // 📉 到診風險提醒（降雨 / 體感過冷）
        // - precipitation 是「目前」降水量（mm），小雨也可能影響到診
        // -------------------------
        const rainRisk = (precipitationNow != null && precipitationNow >= 0.5); // 可調：0.5mm 當作“正在下雨”
        const coldRisk = (coldRef != null && coldRef <= 12); // 體感 <= 12°C 當作高風險
    
        if (rainRisk || coldRisk) {
            const parts: string[] = [];
            if (rainRisk) parts.push(`降雨中（${precipitationNow!.toFixed(1)}mm）`);
            if (coldRisk) parts.push(`偏冷（${Math.round(coldRef!)}°C）`);
    
            alerts.push({
                type: 'market',
                level: 'warning',
                title: `📉 到診風險提醒（${parts.join(' / ')}）`,
                message: '建議客服提前提醒交通與改期選項，並對高價/療程客優先確認到診，降低 no-show。',
                actionLabel: '提醒客服',
                date: now.toISOString()
            });
        }
    
        return alerts;
    }
    
    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }
}

export const externalIntelligence = ExternalIntelligenceService.getInstance();
