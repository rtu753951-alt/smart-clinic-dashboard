export interface TaskItem {
  id: string;
  title: string;
  description: string;
  targetPage: string; // e.g., 'customers', 'appointments'
  targetAction?: string; // e.g., 'openChurnRiskViewGlobal', 'filter:women-30'
  dueDate?: string;
  reminders?: number[]; // Days before due date to remind (e.g. [30, 14, 7, 1])
  createdAt: string;
  status: 'pending' | 'done';
  aiSuggestion?: {
    isSafe: boolean;
    suggestion: string;
    checkedAt: string;
  };
  severity?: 'high' | 'warning' | 'normal';
}

const STORAGE_KEY = 'internalTasks';

/**
 * Demo seed tasks:
 * - Only injected when storage is empty / missing / invalid JSON
 * - Ensures the Tasks page is never completely blank even without API
 *
 * NOTE: targetPage / targetAction 可依你實際頁面與行為調整
 */
const DEFAULT_TASKS: TaskItem[] = [
  {
    id: 'seed-1',
    title: '🔔 檔期提醒：本週活動素材確認',
    description:
      '請確認文案、圖片、優惠與檔期時間是否已同步到系統設定，避免上線後資訊不一致。',
    targetPage: 'operations',
    targetAction: 'openSystemSettings',
    dueDate: '2026-01-29',
    reminders: [30,14,7,1],
    createdAt: new Date().toISOString(),
    status: 'pending',
    severity: 'warning',
  },
  {
    id: 'seed-2',
    title: '🧾 合規測試：全台第一外泌體治療疾病',
    description:
      '確認輸入的標題是否合乎法規(需搭配API Key)，避免合規或排程風險。',
    targetPage: 'operations',
    targetAction: 'openSystemSettings',
    dueDate: '2026-01-30',
    reminders: [30,14,7,1],
    createdAt: new Date().toISOString(),
    status: 'pending',
    severity: 'normal',
  },
];

export const TaskStore = {
  getTasks: (): TaskItem[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      // No storage yet → seed
      if (!raw) {
        // Deep copy to ensure fresh state
        const seeds = JSON.parse(JSON.stringify(DEFAULT_TASKS));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
        return seeds;
      }

      const parsed = JSON.parse(raw);

      // Invalid shape / empty → seed
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeds = JSON.parse(JSON.stringify(DEFAULT_TASKS));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
        return seeds;
      }

      return parsed as TaskItem[];
    } catch (e) {
      console.error('Failed to load tasks', e);
      // Corrupted JSON → seed
      const seeds = JSON.parse(JSON.stringify(DEFAULT_TASKS));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
  },

  getTask: (id: string): TaskItem | undefined => {
    return TaskStore.getTasks().find((t) => t.id === id);
  },

  addTask: (task: Omit<TaskItem, 'id' | 'createdAt' | 'status'>) => {
    const tasks = TaskStore.getTasks();
    const newTask: TaskItem = {
      ...task,
      id: Date.now().toString(), // Simple ID
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    tasks.unshift(newTask); // Add to top
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return newTask;
  },

  completeTask: (id: string) => {
    const tasks = TaskStore.getTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tasks[idx].status = 'done';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  },

  updateTask: (id: string, updates: Partial<TaskItem>) => {
    const tasks = TaskStore.getTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  },

  deleteTask: (id: string) => {
    let tasks = TaskStore.getTasks();
    tasks = tasks.filter((t) => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  },

  // For demo reset
  clearAll: () => {
    localStorage.removeItem(STORAGE_KEY);
  },
};
