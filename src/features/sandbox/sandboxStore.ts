/**
 * Sandbox Store
 * 管理自訂情境模擬的狀態
 */

export interface SandboxState {
    isActive: boolean;
    // 人力增減 (Delta)
    staffDeltas: {
        doctor: number;
        nurse: number;
        therapist: number;
        consultant: number;
    };
    // 療程需求增長率 (Growth Rate, 0.2 = +20%)
    serviceGrowth: {
        inject: number;
        rf: number;
        laser: number;
        drip: number;
        consult: number;
    };
}

type Listener = (state: SandboxState) => void;

class SandboxStore {
    private state: SandboxState = this.getInitialState();
    private listeners: Listener[] = [];

    private getInitialState(): SandboxState {
        return {
            isActive: false,
            staffDeltas: {
                doctor: 0,
                nurse: 0,
                therapist: 0,
                consultant: 0
            },
            serviceGrowth: {
                inject: 0,
                rf: 0,
                laser: 0,
                drip: 0,
                consult: 0
            }
        };
    }

    /**
     * 取得當前狀態 (Read-only copy)
     */
    getState(): SandboxState {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * 啟動模擬模式
     */
    activateSandbox() {
        this.state.isActive = true;
        this.notify();
    }

    /**
     * 關閉模擬模式 (並重置)
     */
    deactivateSandbox() {
        this.resetSimulation();
        this.state.isActive = false;
        this.notify();
    }

    /**
     * 重置參數但保持開啟 (或關閉時被呼叫)
     */
    resetSimulation() {
        const active = this.state.isActive;
        this.state = this.getInitialState();
        this.state.isActive = active; // 保持原有開關狀態 (如果是 Reset 按鈕)
        this.notify();
    }

    /**
     * 更新人力 Delta
     */
    setStaffDelta(role: keyof SandboxState['staffDeltas'], delta: number) {
        this.state.staffDeltas[role] = delta;
        this.notify();
    }

    /**
     * 更新療程成長率
     */
    setServiceGrowth(category: keyof SandboxState['serviceGrowth'], rate: number) {
        this.state.serviceGrowth[category] = rate;
        this.notify();
    }

    /**
     * 訂閱狀態變更
     */
    subscribe(listener: Listener) {
        this.listeners.push(listener);
        // 回傳 unsubscribe 函數
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        const snapshot = this.getState();
        this.listeners.forEach(l => l(snapshot));
        
        // 可選：發送全域事件供非 React/Framework 元件使用
        window.dispatchEvent(new CustomEvent('sandbox-change', { detail: snapshot }));
    }
}

export const sandboxStore = new SandboxStore();
