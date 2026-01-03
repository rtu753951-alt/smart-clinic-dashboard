import { TaskStore, TaskItem } from "../data/taskStore.js";
import { externalIntelligence } from "../services/ExternalIntelligenceService.js";
import { showToast } from "../ui/pageController.js";

export function initTasksPage() {
    console.log("initTasksPage loaded");
    renderTaskList();
    bindManualTaskEvents();
    bindExportEvents();
}

function bindExportEvents() {
    const btnExport = document.getElementById('btn-export-tasks');
    if (btnExport) {
        btnExport.onclick = () => {
            try {
                const tasks = TaskStore.getTasks();
                const jsonStr = JSON.stringify(tasks, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = url;
                link.download = `clinic_tasks_backup_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                showToast('✅ 任務清單已匯出 (JSON)', 'success');
            } catch (e) {
                console.error("Export failed", e);
                showToast('❌ 匯出失敗', 'error');
            }
        };
    }
}

// Global exposure for external navigation (e.g. from Launch Cover)
(window as any).editTask = (taskId: string) => {
    // 1. Ensure we are on tasks page (Controller handles this usually, but double check)
    // If getting here, we assume page is active or switching.
    // If called externally, we might look for the modal.
    
    // We need to ensure DOM is ready.
    const modal = document.getElementById('manual-task-modal');
    if (modal && (modal as any)._openEdit) {
        (modal as any)._openEdit(taskId);
    } else {
        // Retry once if page rendering
        setTimeout(() => {
            const retryModal = document.getElementById('manual-task-modal');
            if (retryModal && (retryModal as any)._openEdit) {
                (retryModal as any)._openEdit(taskId);
            }
        }, 300);
    }
};

function bindManualTaskEvents() {
    const btnOpen = document.getElementById('btn-manual-add-task');
    const modal = document.getElementById('manual-task-modal');
    const btnClose = document.getElementById('manual-task-close');
    const btnSave = document.getElementById('btn-save-manual-task');
    const btnDeleteTask = document.getElementById('btn-delete-manual-task');

    if (!modal) return;

    // HELPER: Open Modal
    const openModal = (editingId?: string) => {
         modal.style.display = 'flex';
         delete modal.dataset.lastAiCheck; // Clear previous AI data

         const titleInput = document.getElementById('manual-task-title') as HTMLInputElement;
         const btnRefreshAi = document.getElementById('btn-refresh-task-ai');
         
         // AI Check Binding (One-time or idempotent)
         if (!titleInput.dataset.aiBound) {
             const runDiagnosis = async (bypass: boolean) => {
                 const text = titleInput.value;
                 const resultPanel = document.getElementById('task-ai-result-panel');
                 
                 if (text.length > 3) {
                     if (bypass) showToast('🤖 強制重新診斷中...', 'info');
                     
                     const check = await externalIntelligence.analyzeMarketingText(text, 'professional', bypass);
                     
                     // Store for persistence
                     modal.dataset.lastAiCheck = JSON.stringify({
                         isSafe: check.isSafe,
                         suggestion: check.suggestion,
                         checkedAt: new Date().toISOString()
                     });

                     // Render AI Suggestion Bubble (Always show content)
                     if (resultPanel) {
                         resultPanel.innerHTML = `
                             <div style="padding: 12px; background: rgba(139, 92, 246, 0.1); border-left: 4px solid #7c3aed; border-radius: 6px;">
                                 <div style="color: #a78bfa; font-weight: bold; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 0.95rem;">
                                      <span>🤖</span> AI 診斷建議 ${check.isSafe ? '(安全)' : '(風險警示)'}
                                 </div>
                                 <div style="color: #e2e8f0; font-size: 0.9rem; line-height: 1.5;">
                                     ${check.suggestion}
                                 </div>
                             </div>
                         `;
                         resultPanel.style.display = 'block';
                     }

                     if (!check.isSafe) {
                         titleInput.style.borderColor = '#ef4444';
                         showToast(`⚖️ ${check.suggestion}`, 'error');
                     } else {
                         titleInput.style.borderColor = '#10b981'; // Green OK
                         if (bypass) showToast('✅ 診斷通過：內容安全', 'success');
                     }
                 } else if (bypass) {
                     showToast('請先輸入至少 3 個字的標題', 'warning');
                 }
             };

             titleInput.addEventListener('blur', () => runDiagnosis(false));
             
             if (btnRefreshAi) {
                 btnRefreshAi.onclick = (e) => {
                     e.preventDefault();
                     
                     const btn = btnRefreshAi as HTMLButtonElement;
                     if (btn.disabled) return;

                     // Trigger Cooldown
                     btn.disabled = true;
                     btn.style.opacity = '0.5';
                     btn.style.cursor = 'not-allowed';
                     
                     // Re-enable after 10s
                     setTimeout(() => {
                         btn.disabled = false;
                         btn.style.opacity = '1';
                         btn.style.cursor = 'pointer';
                     }, 10000);

                     runDiagnosis(true);
                 };
             }

             titleInput.dataset.aiBound = "true";
         }

         const descInput = document.getElementById('manual-task-desc') as HTMLTextAreaElement;
         const dateInput = document.getElementById('manual-task-date') as HTMLInputElement;
         const priorityInput = document.getElementById('manual-task-priority') as HTMLSelectElement;
         const modalTitle = modal.querySelector('h3');
         const saveBtn = document.getElementById('btn-save-manual-task');

         if (editingId) {
             // EDIT MODE
             modal.dataset.editingId = editingId;
             if (modalTitle) modalTitle.innerText = '編輯營運待辦任務';
             if (saveBtn) saveBtn.innerText = '儲存變更';
             if (btnDeleteTask) btnDeleteTask.style.display = 'block'; // Show delete

             const task = TaskStore.getTask(editingId);
             if (task) {
                 // Remove emojis for editing raw title if present (simple check)
                 titleInput.value = task.title.replace(/^🔥\s/, ''); 
                 descInput.value = task.description;
                 dateInput.value = task.dueDate || '';
                 priorityInput.value = task.title.includes('🔥') ? 'high' : 'normal'; 
                 
                 // Populate Reminders
                 const checkboxes = document.querySelectorAll('input[name="reminder"]');
                 checkboxes.forEach((el) => {
                     const cb = el as HTMLInputElement;
                     const val = parseInt(cb.value);
                     cb.checked = (task.reminders && task.reminders.includes(val)) || false;
                 });
             }
         } else {
             // CREATE MODE
             delete modal.dataset.editingId;
             if (modalTitle) modalTitle.innerText = '新增營運待辦任務';
             if (saveBtn) saveBtn.innerText = '立即建立任務';
             if (btnDeleteTask) btnDeleteTask.style.display = 'none'; // Hide delete

             titleInput.value = '';
             descInput.value = '';
             priorityInput.value = 'normal';
             
             // Default Reminders (e.g. 7 days only)
             const checkboxes = document.querySelectorAll('input[name="reminder"]');
             checkboxes.forEach((el) => {
                 const cb = el as HTMLInputElement;
                 cb.checked = cb.value === '7';
             });
             
             // Default date
             const d = new Date();
             d.setDate(d.getDate() + 7);
             dateInput.value = d.toISOString().split('T')[0];
         }
    };

    // Expose open function on modal element for event delegation access
    (modal as any)._openEdit = (id: string) => openModal(id);

    if (btnOpen) {
        btnOpen.onclick = () => openModal();
    }

    if (btnClose) {
        btnClose.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
    };

    // SAVE Handler
    if (btnSave) {
        btnSave.onclick = () => {
            const title = (document.getElementById('manual-task-title') as HTMLInputElement).value;
            const desc = (document.getElementById('manual-task-desc') as HTMLTextAreaElement).value;
            const date = (document.getElementById('manual-task-date') as HTMLInputElement).value;
            const priority = (document.getElementById('manual-task-priority') as HTMLSelectElement).value;
            const editingId = modal.dataset.editingId;

            if (!title) {
                alert('請輸入任務標題');
                return;
            }
            
            const fullTitle = `${priority === 'high' ? '🔥 ' : ''}${title}`;
            
            // Collect Reminders
            const reminders: number[] = [];
            const checkboxesChecked = document.querySelectorAll('input[name="reminder"]:checked');
            checkboxesChecked.forEach((el) => {
                const cb = el as HTMLInputElement;
                reminders.push(parseInt(cb.value));
            });

            // Prepare AI Suggestion Data
            let aiData = undefined;
            if (modal.dataset.lastAiCheck) {
                try {
                    aiData = JSON.parse(modal.dataset.lastAiCheck);
                } catch(e) { console.warn("AI Data Parse Error", e); }
            }

            // Determine Severity (Logic: Manual Priority < AI Risk)
            let severity: 'high' | 'warning' | 'normal' = priority === 'high' ? 'high' : 'normal';
            if (aiData && !aiData.isSafe) {
                severity = 'high'; // AI Override: Unsafe = High Severity
            }

            if (editingId) {
                // UPDATE
                TaskStore.updateTask(editingId, {
                    title: fullTitle,
                    description: desc || '無詳細內容',
                    dueDate: date,
                    reminders: reminders,
                    aiSuggestion: aiData, // Persist AI data on update
                    severity: severity
                });
                showToast('✅ 任務已成功更新', 'success');
            } else {
                // CREATE
                TaskStore.addTask({
                    title: fullTitle,
                    description: desc || '無詳細內容',
                    targetPage: 'overview', 
                    targetAction: '',
                    dueDate: date,
                    reminders: reminders,
                    aiSuggestion: aiData, // Persist AI data on create
                    severity: severity
                });
                showToast('✅ 任務已成功建立', 'success');
            }

            modal.style.display = 'none';
            renderTaskList();
        };
    }

    // DELETE Handler (inside modal)
    if (btnDeleteTask) {
        btnDeleteTask.onclick = () => {
             const editingId = modal.dataset.editingId;
             if (editingId && confirm('確定要永久刪除此任務嗎？')) {
                 TaskStore.deleteTask(editingId);
                 modal.style.display = 'none';
                 renderTaskList();
             }
        };
    }
}

// Helper needed locally if not imported from pageController (but logic implies global showToast exists via window in main context)
// Since this is a module, we can't easily access the internal showToast of pageController unless exposed.
// We'll trust pageController exposed it or we define a simple fallback.



function renderTaskList() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    const tasks = TaskStore.getTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const doneTasks = tasks.filter(t => t.status === 'done');

    let html = '';

    // Pending Section
    if (pendingTasks.length === 0 && doneTasks.length === 0) {
        html += `<div style="text-align:center; padding: 40px; color: #64748b;">
                    <i class="fa-solid fa-clipboard-check" style="font-size: 3rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>目前沒有營運待辦事項</p>
                    <small>點擊右上角小鈴鐺可將系統建議加入待辦</small>
                 </div>`;
    } else {
        html += `<h3 class="section-title" style="margin-bottom: 15px;">待辦事項 (${pendingTasks.length})</h3>`;
        html += `<div class="tasks-grid">`;
        
        pendingTasks.forEach(task => {
            html += createTaskCard(task);
        });
        
        html += `</div>`;

        // Done Section (Optional, maybe collapsible)
        if (doneTasks.length > 0) {
            html += `<h3 class="section-title" style="margin-top: 30px; margin-bottom: 15px; color: #64748b;">已完成 (${doneTasks.length})</h3>`;
            html += `<div class="tasks-grid" style="opacity: 0.7;">`;
            doneTasks.forEach(task => {
                html += createTaskCard(task, true);
            });
            html += `</div>`;
        }
    }

    container.innerHTML = html;
}

function createTaskCard(task: TaskItem, isDone = false) {
    // Action handling script string
    // We bind a global function or inline js. 
    // Since we are module based, explicit window binding in pageController/main is usually safer for inline onclicks, 
    // OR we add event listeners after render.
    // I'll render data attributes and bind events in a second pass for cleanliness.
    
    // Logic for "Navigate": switchPage(task.targetPage)
    
    return `
        <div class="task-card ${isDone ? 'done' : ''}" data-id="${task.id}">
            <div class="task-header">
                <div class="task-status-icon">${isDone ? '<i class="fa-solid fa-check-circle"></i>' : '<i class="fa-regular fa-circle"></i>'}</div>
                <div class="task-info">
                    <div class="task-title">${task.title}</div>
                    <div class="task-desc">${task.description}</div>
                    <div class="task-meta">
                        <span><i class="fa-regular fa-calendar"></i> 建立於: ${new Date(task.createdAt).toLocaleDateString()}</span>
                        ${task.dueDate ? `<span><i class="fa-solid fa-hourglass-half"></i> 期限: ${task.dueDate}</span>` : ''}
                    </div>
                </div>
                <button class="btn-icon task-delete-btn" title="刪除" data-id="${task.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
            ${!isDone ? `
                <div class="task-actions">
                    <button class="btn-primary task-nav-btn" data-page="${task.targetPage}" data-action="${task.targetAction || ''}">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 立即前往處理
                    </button>
                    <button class="btn-secondary task-edit-btn" data-id="${task.id}" style="border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05);">
                        <i class="fa-solid fa-pen"></i> 編輯
                    </button>
                    <button class="btn-secondary task-complete-btn" data-id="${task.id}">
                        <i class="fa-solid fa-check"></i> 標記完成
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// Event Delegation
document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    
    // Complete
    const completeBtn = target.closest('.task-complete-btn');
    if (completeBtn) {
        const id = (completeBtn as HTMLElement).dataset.id;
        if (id) {
            TaskStore.completeTask(id);
            renderTaskList();
        }
    }

    // Delete
    const deleteBtn = target.closest('.task-delete-btn');
    if (deleteBtn) {
        const id = (deleteBtn as HTMLElement).dataset.id;
        if (id && confirm('確定要刪除此任務嗎？')) {
            TaskStore.deleteTask(id);
            renderTaskList();
        }
    }

    // Navigate
    const navBtn = target.closest('.task-nav-btn');
    if (navBtn) {
        const page = (navBtn as HTMLElement).dataset.page;
        const action = (navBtn as HTMLElement).dataset.action;
        
        if (page && (window as any).switchPage) {
            (window as any).switchPage(page);
            
            // Handle specific actions if needed
            if (action) {
                // Wait for page transition
                setTimeout(() => {
                    executeAction(action);
                }, 500);
            }
        }
    }

    // Edit Delegation
    const editBtn = target.closest('.task-edit-btn');
    if (editBtn) {
        const id = (editBtn as HTMLElement).dataset.id;
        const modal = document.getElementById('manual-task-modal');
        if (id && modal && (modal as any)._openEdit) {
            (modal as any)._openEdit(id);
        }
    }
});


function executeAction(action: string) {
    // Simple command dispatcher
    if (action === 'openChurnRiskViewGlobal' && (window as any).openChurnRiskViewGlobal) {
        (window as any).openChurnRiskViewGlobal();
    } else {
        console.log(`[Task] Requested action: ${action} (Not implemented or just page navigation)`);
    }
}
