import fs
import os

file_path = 'd:/Backup/clinic_dashboard_ai/src/pages/launchCoverPage.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Marker for start of replacement
start_marker = '// 3. Sorting'
# Marker for end (we want to replace up to the closing of the IIFE)
# The IIFE ends with })() and is inside the template string.
# We can look for the return statement's closing div and the })()
end_marker = '})()'

start_idx = content.find(start_marker)
# Find the LAST instance of end_marker because there might be nested ones? 
# No, })() is unique for the IIFE close.
# But wait, step 63 shows `})()` at line 582, and there might be others?
# Actually the `})()` usually appears at the end of the block.
# Let's search from start_idx to be safe.
end_idx = content.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print('Could not find markers')
    print(f'Start found: {start_idx}, End found: {end_idx}')
    exit(1)

# Add length of end_marker to include it? No, we want to replace UP TO it if we include it in new_logic.
# My new_logic ends with `})()`.
# So I should include it in replacement or exclude it from preserved?
# I will make new_logic include it.
end_idx += len(end_marker)

new_logic = """// 3. Sorting & Mixed Strategy (Task + Risks)
                const internalTasks = sorted.filter(r => r.type === 'task');
                const riskAlerts = sorted.filter(r => r.type !== 'task');

                let primaryCards: any[] = [];
                const usedIds = new Set<string>();

                // Strategy: 1 Todo + Rest Risks
                // Step A: Pick 1 Internal Task (if any)
                if (internalTasks.length > 0) {
                    const topTask = internalTasks[0];
                    primaryCards.push(topTask);
                    usedIds.add(JSON.stringify(topTask));
                }

                // Step B: Fill remaining slots with Top Risk Alerts
                const slotsLeft = maxCards - primaryCards.length;
                let addedRisks = 0;
                for (const risk of riskAlerts) {
                    if (addedRisks >= slotsLeft) break;
                    primaryCards.push(risk);
                    usedIds.add(JSON.stringify(risk));
                    addedRisks++;
                }

                // Step C: If still have slots (e.g. no risks), fill with remaining sorted items
                if (primaryCards.length < maxCards) {
                    const remainingSlots = maxCards - primaryCards.length;
                    const leftovers = sorted.filter(r => !usedIds.has(JSON.stringify(r)));
                    for (let i = 0; i < remainingSlots && i < leftovers.length; i++) {
                         primaryCards.push(leftovers[i]);
                         usedIds.add(JSON.stringify(leftovers[i]));
                    }
                }
                
                // Sort Primary Cards by Priority Score
                primaryCards.sort((a, b) => getScore(b) - getScore(a));

                // Calculate Overflow
                const overflowCards = sorted.filter(r => !usedIds.has(JSON.stringify(r)));
                const overflowCount = overflowCards.length;
                const totalRisk = sorted.filter(r => checkRisk(r)).length;

                // 4. Prepare Data Structure
                const launchTaskData = {
                    headerBadges: [
                        totalRisk > 0 ? { key: 'risk', label: `⚠️ 風險 ${totalRisk}`, count: totalRisk, style: 'background: rgba(220, 38, 38, 0.2); color: #f87171; border: 1px solid rgba(220, 38, 38, 0.4);' } : null,
                        overflowCount > 0 ? { key: 'more', label: `+${overflowCount} 更多`, count: overflowCount, style: 'background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4);' } : null
                    ].filter(Boolean) as any[]
                };

                // 5. Render Functions
                const renderCard = (task: any) => {
                    const t = task.id ? TaskStore.getTask(task.id) : null;
                    const aiUnsafe = t?.aiSuggestion && !t.aiSuggestion.isSafe;
                    const isHighRisk = aiUnsafe || checkRisk(task);
                    const borderClass = isHighRisk ? 'task-card-risk' : 'task-card-normal';
                    
                    let cleanDesc = task.desc;
                    if (aiUnsafe) cleanDesc = `⚖️ AI 建議：${t?.aiSuggestion?.suggestion}`;
                    if (cleanDesc.length > 40) cleanDesc = cleanDesc.substring(0, 38) + '...';

                    return `
                        <div class="launch-task-card ${borderClass}" onclick="window.switchPage('tasks')">
                            <div class="task-card-header">
                                <div class="task-card-icon ${isHighRisk ? 'icon-risk' : 'icon-normal'}" style="${isHighRisk ? 'color: #ef4444;' : ''}">
                                    <i class="fa-solid ${isHighRisk ? 'fa-triangle-exclamation' : 'fa-bell'}"></i>
                                </div>
                                <div class="task-card-title">
                                    ${task.title}
                                    ${isHighRisk ? `<span class="risk-tag" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.5);">${aiUnsafe ? 'AI 警示' : '違規風險'}</span>` : ''}
                                </div>
                            </div>
                            <div class="task-card-desc" style="${aiUnsafe ? 'color: #fca5a5;' : ''}">${cleanDesc}</div>
                            ${task.diffDays !== undefined && task.diffDays !== 0 ? `<div class="task-card-meta"><i class="fa-regular fa-clock"></i> 剩 ${task.diffDays} 天</div>` : ''}
                        </div>
                    `;
                };

                const renderBadge = (b: any) => `
                    <span class="launch-badge" 
                          onclick="document.getElementById('launch-more-modal').classList.add('active')"
                          style="cursor: pointer; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px; ${b.style}">
                        ${b.label}
                    </span>
                `;

                return `
                    <div class="launch-task-preview-section">
                        <div class="task-preview-header">
                            <i class="fa-solid fa-clipboard-check"></i>
                            <span>即時任務預覽</span>
                            
                            <!-- Header Badges -->
                            <div class="header-badges" style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
                                ${launchTaskData.headerBadges.map(renderBadge).join('')}
                                ${launchTaskData.headerBadges.length === 0 ? `<span class="task-count" style="margin: 0; opacity: 0.6; font-size: 0.8rem;">暫無緊急事項</span>` : ''}
                            </div>
                        </div>
                        
                        <div class="task-preview-cards">
                            ${primaryCards.map(renderCard).join('')}
                        </div>

                        <!-- Modal Structure -->
                        <div id="launch-more-modal" class="launch-modal-overlay">
                            <div class="launch-modal-content glass-panel">
                                <div class="launch-modal-header">
                                    <h3>🔔 所有提醒清單 (${sorted.length})</h3>
                                    <button class="close-btn" onclick="document.getElementById('launch-more-modal').classList.remove('active')">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                                <div class="launch-modal-body">
                                    ${sorted.map(task => {
                                        const isHighRisk = checkRisk(task);
                                        return `
                                            <div class="modal-list-item ${isHighRisk ? 'item-risk' : ''}" onclick="window.switchPage('tasks')">
                                                <div class="item-icon">
                                                    <i class="fa-solid ${isHighRisk ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
                                                </div>
                                                <div class="item-info">
                                                    <div class="item-title">${task.title}</div>
                                                    <div class="item-desc">${task.desc}</div>
                                                </div>
                                                ${task.type !== 'task' ? `<span class="item-tag">外部</span>` : ''}
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <style>
                            .launch-modal-overlay {
                                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                                background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
                                z-index: 9999;
                                display: flex; align-items: center; justify-content: center;
                                opacity: 0; pointer-events: none; transition: opacity 0.3s;
                            }
                            .launch-modal-overlay.active {
                                opacity: 1; pointer-events: auto;
                            }
                            .launch-modal-content {
                                width: 90%; max-width: 500px; max-height: 80vh;
                                background: rgba(17, 24, 39, 0.95);
                                border: 1px solid rgba(255,255,255,0.1);
                                border-radius: 16px;
                                display: flex; flex-direction: column;
                                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                            }
                            .launch-modal-header {
                                padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);
                                display: flex; justify-content: space-between; align-items: center;
                            }
                            .launch-modal-header h3 { margin: 0; font-size: 1.1rem; color: #fff; }
                            .close-btn { background: none; border: none; color: rgba(255,255,255,0.6); font-size: 1.2rem; cursor: pointer; }
                            .close-btn:hover { color: #fff; }
                            .launch-modal-body { padding: 16px; overflow-y: auto; }
                            .modal-list-item {
                                display: flex; gap: 12px; padding: 12px;
                                border-radius: 8px; background: rgba(255,255,255,0.03);
                                margin-bottom: 8px; cursor: pointer; transition: background 0.2s;
                                align-items: flex-start;
                            }
                            .modal-list-item:hover { background: rgba(255,255,255,0.08); }
                            .modal-list-item.item-risk { border-left: 3px solid #ef4444; background: rgba(239,68,68,0.05); }
                            .item-icon { margin-top: 2px; color: rgba(255,255,255,0.5); font-size: 0.9rem; }
                            .modal-list-item.item-risk .item-icon { color: #ef4444; }
                            .item-info { flex: 1; min-width: 0; }
                            .item-title { font-weight: 500; font-size: 0.95rem; margin-bottom: 2px; color: #e5e7eb; }
                            .item-desc { font-size: 0.85rem; color: rgba(255,255,255,0.6); line-height: 1.4; }
                            .item-tag { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); height: fit-content; margin-top: 2px; }
                        </style>
                    </div>
                `;
})()"""

final_content = content[:start_idx] + new_logic + content[end_idx:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(final_content)

print('Update successful')
