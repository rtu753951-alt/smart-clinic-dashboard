// 暫時關閉 TS 的型別檢查（因為我們是 browser global）
/* eslint-disable */
// @ts-nocheck

declare const Chart: any;

import { dataStore } from "../data/dataStore.js";

// === State Cache ===
let cachedMonth: string = "";
let filteredAppts: any[] = [];
let equipUsageMinutes: Record<string, number> = {}; // 設備名稱 -> 總分鐘數
let roomHeatmapData: Record<string, Record<string, number>> = {}; // 診間 -> 時段 -> 次數

// === Chart Instance ===
let equipChart: any = null; // Chart.js 實例

// === Pagination State ===
let currentPage = 1;
const PAGE_SIZE = 50;

/**
 * 初始化 Rooms Page
 * 每次切換到此頁面或月份變更時呼叫
 */
export function initRoomsPage() {
    console.log("[RoomsPage] Init");

    // 1. 取得全域月份 (與智慧自動選取)
    let globalMonth = (window as any).currentDashboardMonth;

    if (!globalMonth && dataStore.appointments && dataStore.appointments.length > 0) {
        // 智慧選取：找資料最多的月份
        const monthCounts = dataStore.appointments.reduce((acc, a) => {
            const m = a.date.slice(0, 7);
            acc[m] = (acc[m] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const bestMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
        globalMonth = bestMonth ? bestMonth[0] : new Date().toISOString().slice(0, 7);
        (window as any).currentDashboardMonth = globalMonth;
        console.log(`[RoomsPage] Auto-selected best month: ${globalMonth}`);
    } else if (!globalMonth) {
        globalMonth = new Date().toISOString().slice(0, 7);
        (window as any).currentDashboardMonth = globalMonth;
    }

    // 2. 檢查資料是否就緒 (Strict Readiness Check)
    if (!dataStore.isAppointmentsLoaded) {
        console.log("[RoomsPage] Appointments data not ready. Prefetching...");
        const container = document.getElementById("roomHeatmap");
        if (container) {
            container.innerHTML = `
                <div style="text-align:center; padding: 60px; color:#64748b;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>正在載入房室數據分析中...</p>
                </div>`;
        }
        
        dataStore.loadAppointments().then(() => {
            console.log("[RoomsPage] Data loaded, re-initializing...");
            initRoomsPage();
        });
        return;
    }

    // 3. 檢查是否需要重新計算數據 (緩存機制)
    if (globalMonth !== cachedMonth || filteredAppts.length === 0) {
        console.log(`[RoomsPage] Data Refresh for ${globalMonth}`);
        updateDataCache(globalMonth);
    }

    // 4. 渲染各區塊
    renderRoomHeatmap();
    renderEquipmentUsage();
    renderEquipmentLog(); // 內含分頁邏輯
    renderAISuggestions();
}

/**
 * 核心數據更新邏輯
 * - 過濾資料
 * - 聚合計算 (設備分鐘數、熱力圖數據)
 * - 重置分頁
 */
function updateDataCache(month: string) {
    cachedMonth = month;
    
    // 1. 過濾當月資料 (Strict Filtering for Actual Usage)
    if (!dataStore.appointments) return;
    
    // 定義有效的使用狀態 (依據語意：人有到、設備有被用)
    const VALID_STATUSES = ['completed', 'paid', 'in_service'];

    filteredAppts = dataStore.appointments.filter(a => {
        if (!a.date || !a.date.startsWith(month)) return false;
        
        const status = (a.status || '').toLowerCase();
        // 必須屬於有效狀態，明確排除 no_show / canceled
        return VALID_STATUSES.includes(status);
    });

    console.log(`[RoomsPage] Month: ${month}, Found ${filteredAppts.length} valid appointments.`);

    // 2. 聚合計算
    equipUsageMinutes = {};
    roomHeatmapData = {};

    filteredAppts.forEach(a => {
        // --- A. 設備使用分鐘數 ---
        if (a.equipment) {
            // 預設每筆預約 30 分鐘，若有 duration 欄位則使用之
            const duration = a.duration ? Number(a.duration) : 30; 
            equipUsageMinutes[a.equipment] = (equipUsageMinutes[a.equipment] || 0) + duration;
        }

        // --- B. 熱力圖數據 (Room x Hour) ---
        if (a.room && a.time && a.status !== 'cancelled') {
            const hour = a.time.split(":")[0]; // "14:30" -> "14"
            const room = a.room;
            
            if (!roomHeatmapData[room]) roomHeatmapData[room] = {};
            roomHeatmapData[room][hour] = (roomHeatmapData[room][hour] || 0) + 1;
        }
    });

    console.log(`[RoomsPage] Aggregate result. Equipment keys:`, Object.keys(equipUsageMinutes));

    // 3. 重置分頁
    currentPage = 1;
}

/* =========================================
   1. 診間 x 時段 熱力圖 (CSS Grid 實作)
   ========================================= */
function renderRoomHeatmap() {
    const container = document.getElementById("roomHeatmap");
    if (!container) return;

    // 定義時段範圍 (營業時間 12:00 - 21:00，顯示至 20:00)
    const hours = ["12", "13", "14", "15", "16", "17", "18", "19", "20"];
    
    // 取得所有診間名稱並排序
    const rooms = Object.keys(roomHeatmapData).sort();
    
    if (rooms.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 40px; color:#888;">本月無診間使用數據</div>`;
        return;
    }

    // 計算最大值 (用於動態色彩)
    let maxCount = 0;
    rooms.forEach(room => {
        hours.forEach(h => {
            const c = roomHeatmapData[room][h] || 0;
            if (c > maxCount) maxCount = c;
        });
    });
    // 避免除以 0
    if (maxCount < 1) maxCount = 1;

    // 組合 HTML
    // 使用 Grid Layout: Header row + Data rows
    let html = `
        <div style="display: grid; grid-template-columns: 120px repeat(${hours.length}, 1fr); gap: 4px; overflow-x: auto;">
            <!-- Header Row -->
            <div style="font-weight:bold; color:#666; text-align:right; padding-right:10px;">診間 / 時段</div>
            ${hours.map(h => `<div style="text-align:center; font-weight:bold; color:#666;">${h}:00</div>`).join('')}
    `;

    // Data Rows
    rooms.forEach(room => {
        // Room Name Cell
        html += `<div style="font-weight:bold; color:#333; padding: 8px 0; border-bottom:1px solid #eee;">${room}</div>`;
        
        // Hour Cells
        hours.forEach(h => {
            const count = roomHeatmapData[room][h] || 0;
            
            // --- Dynamic Color Mapping Logic ---
            // Low (ratio < 0.25): Cool Grey/Slate (Idle/Low)
            // Mid (ratio 0.25 - 0.60): Blue/Green (Optimal)
            // High (ratio >= 0.60): Orange/Red (Busy)
            
            let bg = "#f8fafc"; // Default (0)
            let text = "#cbd5e1"; // Default Text for 0
            
            if (count > 0) {
                text = "#333";
                const ratio = count / maxCount;
                
                if (ratio < 0.25) {
                    // Cool Grey / Slate (Low Load)
                    // rgba(148, 163, 184, alpha)
                    const alpha = 0.2 + (ratio / 0.25) * 0.3; 
                    bg = `rgba(148, 163, 184, ${alpha})`; 

                } else if (ratio < 0.60) {
                    // Mid Range: Blue/Green (Healthy Load)
                    // rgba(16, 185, 129, alpha) -> Emerald
                    const norm = (ratio - 0.25) / 0.35;
                    const alpha = 0.3 + norm * 0.4;
                    bg = `rgba(16, 185, 129, ${alpha})`;
                    
                } else {
                    // High Range: Orange/Red (Heavy Load)
                    const norm = (ratio - 0.60) / 0.40;
                    const alpha = 0.6 + norm * 0.4;
                    // Gradient from Orange to Red
                    if (ratio > 0.85) {
                        bg = `rgba(220, 38, 38, ${alpha})`; // Red
                    } else {
                        bg = `rgba(249, 115, 22, ${alpha})`; // Orange
                    }
                    
                    if (alpha > 0.7) text = "#fff";
                }
            }

            html += `
                <div style="
                    background: ${bg}; 
                    color: ${text};
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    margin: 2px;
                    font-weight: ${count > 0 ? 'bold' : 'normal'};
                ">
                    ${count > 0 ? count : '-'}
                </div>
            `;
        });
    });

    html += `</div>`;
    
    // Add Legend
    html += `
        <div style="margin-top: 10px; display: flex; gap: 15px; justify-content: flex-end; font-size: 0.8rem; color: #666;">
            <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:rgba(148,163,184,0.4); border-radius:2px;"></span> 閒置/低載</div>
            <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:rgba(16,185,129,0.5); border-radius:2px;"></span> 適中</div>
            <div style="display:flex; align-items:center; gap:5px;"><span style="width:12px; height:12px; background:rgba(249,115,22,0.9); border-radius:2px;"></span> 繁忙/滿載</div>
        </div>
    `;

    container.innerHTML = html;
}

/* =========================================
   2. 設備使用率（Bar Chart - Optimized）
   ========================================= */
function renderEquipmentUsage() {
    const canvas = document.getElementById("equipUsageChart") as HTMLCanvasElement;
    if (!canvas) return;

    // 資料準備
    const labels = Object.keys(equipUsageMinutes).sort(); // 確保排序一致
    const values = labels.map(k => equipUsageMinutes[k]);

    console.log(`[RoomsPage] Rendering Equipment Chart. Labels: ${labels.length}, Data:`, values);

    // 若無數據
    if (labels.length === 0) {
        if (equipChart) {
            equipChart.destroy();
            equipChart = null;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '14px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('本月尚無設備使用數據', canvas.width / 2, canvas.height / 2);
        }
        return;
    }

    // 更新或建立圖表
    if (equipChart) {
        equipChart.data.labels = labels;
        equipChart.data.datasets[0].data = values;
        equipChart.update();
    } else {
        equipChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "本月累計使用 (分鐘)",
                        data: values,
                        backgroundColor: "rgba(59, 130, 246, 0.7)",
                        borderColor: "rgba(59, 130, 246, 1)",
                        borderWidth: 1,
                        borderRadius: 6,
                        minBarLength: 5 // 關鍵：確保小數值也能看見
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // 暫時關閉動畫以利觀察即時變化
                layout: {
                    padding: {
                        left: 20,
                        right: 20,
                        top: 20,
                        bottom: 10
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: {
                            callback: (value: any) => value.toLocaleString() + ' min'
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.05)'
                        },
                        suggestedMax: 100 // 基本高度
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 12 }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { boxWidth: 12, usePointStyle: true }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        padding: 12,
                        titleFont: { size: 14 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            label: (context: any) => ` 使用時長: ${context.parsed.y.toLocaleString()} 分鐘`
                        }
                    }
                }
            }
        });
    }
}

/* =========================================
   3. 設備使用紀錄表格 (Virtual List / Pagination)
   ========================================= */
function renderEquipmentLog() {
    const tbody = document.querySelector("#equipLogTable tbody");
    const container = document.querySelector("#equipLogTable").parentElement; // table-container
    if (!tbody || !container) return;

    // 清空現有內容
    tbody.innerHTML = "";
    
    // 如果沒有資料
    if (filteredAppts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">本月無設備使用紀錄</td></tr>`;
        removePaginationControls(container);
        return;
    }

    // 計算分頁範圍
    const filteredWithEquip = filteredAppts.filter(a => a.equipment); // 只顯示有設備的
    const totalItems = filteredWithEquip.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    
    // 防呆
    if (currentPage > totalPages) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    const pageData = filteredWithEquip.slice(startIdx, endIdx);

    // 渲染 Rows
    pageData.forEach(a => {
        const tr = document.createElement("tr");
        const duration = a.duration ? a.duration + " 分鐘" : "30 分鐘";
        
        tr.innerHTML = `
            <td>${a.date}</td>
            <td>${a.time}</td>
            <td><strong style="color: var(--primary-color);">${a.equipment}</strong></td>
            <td>${a.assistant_name || "-"}</td>
            <td>${duration}</td>
            <td>
                <span class="status-badge status-${a.status}">
                    ${a.status}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 渲染分頁控制項
    renderPaginationControls(container, totalPages, totalItems);
}

/**
 * 渲染分頁控制按鈕
 */
function renderPaginationControls(container: HTMLElement, totalPages: number, totalItems: number) {
    // 檢查是否已經有控制項，若有則更新，若無則建立
    let controls = container.nextElementSibling as HTMLElement;
    if (!controls || !controls.classList.contains('pagination-controls')) {
        controls = document.createElement('div');
        controls.className = 'pagination-controls';
        controls.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8fafc; border-top: 1px solid #e2e8f0;";
        container.after(controls);
    }

    controls.innerHTML = `
        <div style="flex: 1;">
            <span style="color: #64748b; font-size: 0.9rem;">
                顯示 ${Math.min((currentPage - 1) * PAGE_SIZE + 1, totalItems)} - ${Math.min(currentPage * PAGE_SIZE, totalItems)} 筆，共 ${totalItems} 筆
            </span>
            <div style="color: #94a3b8; font-size: 0.75rem; margin-top: 4px;">
                ℹ️ 本列表僅納入實際使用紀錄 (Completed/Paid)，不含 No Show/Canceled
            </div>
        </div>
        <div style="display: flex; gap: 8px;">
            <button id="btnPrevRooms" class="btn-secondary" ${currentPage === 1 ? 'disabled' : ''} style="padding: 4px 12px;">上一頁</button>
            <span style="line-height: 28px; font-weight: bold; color: #334155;">Page ${currentPage} / ${totalPages}</span>
            <button id="btnNextRooms" class="btn-secondary" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 4px 12px;">下一頁</button>
        </div>
    `;

    // 綁定事件
    document.getElementById("btnPrevRooms")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderEquipmentLog();
        }
    });

    document.getElementById("btnNextRooms")?.addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderEquipmentLog();
        }
    });
}

function removePaginationControls(container: HTMLElement) {
    const controls = container.nextElementSibling;
    if (controls && controls.classList.contains('pagination-controls')) {
        controls.remove();
    }
}


/* =========================================
   4. A.I. 建議 (Premium Service Philosophy)
   ========================================= */
function renderAISuggestions() {
    const section = document.getElementById("room-ai-suggestions-container");
    if (!section) return;

    // 1. 找出使用時間最長的設備與總體趨勢
    const sortedEquip = Object.entries(equipUsageMinutes).sort((a, b) => b[1] - a[1]);
    
    if (sortedEquip.length === 0) {
        section.innerHTML = `
            <div style="padding: 16px; background: rgba(0,0,0,0.03); border-radius: 8px; text-align: center; color: #888;">
                本月尚無設備使用數據，AI 無法提供建議
            </div>
        `;
        return;
    }

    const [topName, topMins] = sortedEquip[0];
    const totalMinutes = Object.values(equipUsageMinutes).reduce((a, b) => a + b, 0);
    const usageShare = totalMinutes > 0 ? (topMins / totalMinutes) : 0;

    // Detect Global Peak Hour from roomHeatmapData
    let maxHourTotal = 0;
    let peakHour = "12";
    const hours = ["12", "13", "14", "15", "16", "17", "18", "19", "20"];
    
    hours.forEach(h => {
        let hTotal = 0;
        Object.keys(roomHeatmapData).forEach(r => {
            hTotal += (roomHeatmapData[r][h] || 0);
        });
        if (hTotal > maxHourTotal) {
            maxHourTotal = hTotal;
            peakHour = h;
        }
    });

    let suggestionHTML = "";

    // 2. 根據數據生成具體策略 (Service Quality Oriented with Peak Detection)
    
    if (usageShare > 0.6) {
        // [High Utilization]
        suggestionHTML = `
            <div style="display: flex; align-items: start; gap: 12px; padding: 16px; background: rgba(239, 68, 68, 0.05); border-left: 4px solid #ef4444; border-radius: 6px;">
                <div style="font-size: 1.5rem;">🌟</div>
                <div>
                    <strong style="color: #b91c1c; font-size: 1rem;">核心服務承載力預警</strong>
                    <p style="color: #450a0a; margin: 4px 0 0 0; font-size: 0.95rem;">
                        偵測到「<strong>${topName}</strong>」時段利用率極高（${(usageShare * 100).toFixed(0)}%），且全院高峰約在 <strong>${peakHour}:00</strong>。
                        <br/>為確保 VIP 客戶的預約彈性與服務細緻度：
                        <ul style="margin: 4px 0 0 0; padding-left: 20px;">
                            <li>建議在 ${peakHour}:00 前後啟動備用診間分流術後護理流程。</li>
                            <li>針對 VIP 客戶預留專屬緩衝時段，避免尖峰時刻的等待。</li>
                        </ul>
                    </p>
                </div>
            </div>
        `;
    } else if (topMins > 1000) {
        // [Heavy Load]
        suggestionHTML = `
            <div style="display: flex; align-items: start; gap: 12px; padding: 16px; background: rgba(245, 158, 11, 0.05); border-left: 4px solid #f59e0b; border-radius: 6px;">
                <div style="font-size: 1.5rem;">⚙️</div>
                <div>
                    <strong style="color: #b45309; font-size: 1rem;">設備品質與穩定性確保</strong>
                    <p style="color: #78350f; margin: 4px 0 0 0; font-size: 0.95rem;">
                        「<strong>${topName}</strong>」本月運轉強度高，且集中於 <strong>${peakHour}:00</strong> 時段。
                        為維持最佳治療效果，建議避開此尖峰進行光學校準與探頭效能檢測，確保每一發治療的精準度。
                    </p>
                </div>
            </div>
        `;
    } else {
        // [Balanced]
        suggestionHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding: 16px; background: rgba(16, 185, 129, 0.05); border-left: 4px solid #10b981; border-radius: 6px;">
                <div style="font-size: 1.5rem;">✨</div>
                <div>
                    <strong style="color: #047857; font-size: 1rem;">服務資源配置優良</strong>
                    <p style="color: #064e3b; margin: 4px 0 0 0; font-size: 0.95rem;">
                        目前設備資源運轉餘裕充足（今日高峰 ${peakHour}:00 亦在安全範圍）。
                        建議把握此良好的調度彈性，為每位客戶提供更深度的諮詢與完整的術後關懷。
                    </p>
                </div>
            </div>
        `;
    }

    section.innerHTML = suggestionHTML;
}
