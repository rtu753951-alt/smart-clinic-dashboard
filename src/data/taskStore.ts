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

export const TaskStore = {
    getTasks: (): TaskItem[] => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error("Failed to load tasks", e);
            return [];
        }
    },

    getTask: (id: string): TaskItem | undefined => {
        return TaskStore.getTasks().find(t => t.id === id);
    },

    addTask: (task: Omit<TaskItem, 'id' | 'createdAt' | 'status'>) => {
        const tasks = TaskStore.getTasks();
        const newTask: TaskItem = {
            ...task,
            id: Date.now().toString(), // Simple ID
            createdAt: new Date().toISOString(),
            status: 'pending'
        };
        tasks.unshift(newTask); // Add to top
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return newTask;
    },

    completeTask: (id: string) => {
        const tasks = TaskStore.getTasks();
        const idx = tasks.findIndex(t => t.id === id);
        if (idx !== -1) {
            tasks[idx].status = 'done';
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        }
    },

    updateTask: (id: string, updates: Partial<TaskItem>) => {
        const tasks = TaskStore.getTasks();
        const idx = tasks.findIndex(t => t.id === id);
        if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], ...updates };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        }
    },

    deleteTask: (id: string) => {
        let tasks = TaskStore.getTasks();
        tasks = tasks.filter(t => t.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    },
    
    // For demo reset
    clearAll: () => {
        localStorage.removeItem(STORAGE_KEY);
    }
};
