import { AIReportInput, AIReportOutput } from "../logic/aiManager";
import { calculateTrends } from "../logic/trendEngine.js";
import { AppointmentRecord } from "../data/schema";

export function generateAIReport(
    data: AIReportInput,
    appointments: AppointmentRecord[]
): AIReportOutput {

    const { todayTotal, todayShow, showRate, doctorTop3, treatmentTop3 } = data;

    // 沒到診人數
    const noShow = Math.max(todayTotal - todayShow, 0);

    const topDoctor = doctorTop3[0];
    const topTreatment = treatmentTop3[0];

    // 🔥 趨勢計算
    const trend = calculateTrends(appointments);

    // 趨勢符號
    const up = "🔺";
    const down = "🔻";
    const flat = "➖";
    const sign = (n: number) => (n > 0 ? up : n < 0 ? down : flat);

    // ===== Summary =====
    let summary = `
今日共有 ${todayTotal} 筆預約，其中 ${todayShow} 筆已完成或到診，整體到診率為 ${showRate}%。`;

    if (noShow > 0) {
        summary += ` 共有 ${noShow} 筆未到診或取消，建議後續追蹤原因。`;
    }

    summary += `
在醫師端，目前預約量最高的是「${topDoctor?.doctor ?? "無資料"}」，佔前 3 名醫師中的約 ${topDoctor?.count ?? 0} 件；
療程端則以「${topTreatment?.name ?? "無資料"}」最為熱門。`;

    // ===== KPI Insights =====
    const kpi_insights = [
        `今日預約共 ${todayTotal} 件，到診 / 取消共 ${todayShow} 件。`,
        `整體到診率為 ${showRate}%，需維持流程與提醒機制。`,
        `醫師端以「${topDoctor?.doctor ?? "無資料"}」為最高 (${topDoctor?.count ?? 0} 件)。`,
        `療程端以「${topTreatment?.name ?? "無資料"}」最熱門 (${topTreatment?.count ?? 0} 件)。`
    ];

    // ===== Alerts =====
    const alerts: string[] = [];
    if (showRate < 50) alerts.push(`⚠ 到診率低於 50%，建議檢查提醒機制（簡訊 / LINE）。`);
    if (noShow > 3) alerts.push(`⚠ 未到診人數偏高，建議後續追蹤原因。`);

    // ===== Action Suggestions =====
    const actions = [
        `針對明日預約名單啟動加強提醒（簡訊 / LINE）。`,
        `整理今日未到診 / 取消名單，聯絡並了解原因（天氣、交通、個人因素等）。`,
        `依照今日熱門療程與醫師 Top3 規劃下週社群與廣宣主題。`,
        `檢查是否有高價療程成交率異常下降，是否需調整話術或價格策略。`
    ];

    // ===== 趨勢摘要 =====
    let trendSummary = `
📈 **AI 趨勢分析（與昨日比較）**
- 今日總預約：${trend.today}（${sign(trend.diffDay)} ${Math.abs(trend.diffDay)}）
- 今日熱門療程變化：
${trend.topTreatmentTrend.map(t =>
    `  • ${t.name}：${t.today} 件（${sign(t.diff)} ${Math.abs(t.diff)}）`
).join("\n")}
- 今日醫師預約變化：
${trend.topDoctorTrend.map(d =>
    `  • ${d.name}：${d.today} 件（${sign(d.diff)} ${Math.abs(d.diff)}）`
).join("\n")}
`;

    return {
        summary,
        kpi_insights,
        alerts,
        actions,
        doctorTop3,
        treatmentTop3,
        todayTotal,
        todayShow,
        showRate,
        trendSummary
    };
}
// === 將 AI 報告渲染到畫面 ===
export function renderFullAIReport(report: AIReportOutput) {
    const el = document.getElementById("ai-full-report");
    if (!el) return;

    el.innerHTML = `
        <div class="ai-report">

            <h3>📊 今日 AI 智慧營運報告</h3>
            <p class="ai-summary">${report.summary}</p>

            <!-- KPI Insights -->
            <h4>📌 營運重點（KPI Insights）</h4>
            <ul>
                ${report.kpi_insights.map(i => `<li>${i}</li>`).join("")}
            </ul>

            <!-- Alerts -->
            <h4>⚠ 異常與風險（Alerts）</h4>
            ${
                report.alerts.length > 0
                ? `<ul>${report.alerts.map(a => `<li>${a}</li>`).join("")}</ul>`
                : `<p>今日無重大異常。</p>`
            }

            <!-- Actions -->
            <h4>🛠 可執行的行動建議（Actions）</h4>
            <ul>
                ${report.actions.map(a => `<li>${a}</li>`).join("")}
            </ul>

            <!-- Doctor Top 3 -->
            <h4>👨‍⚕️ 醫師 Top 3（預約量）</h4>
            <ul>
                ${report.doctorTop3.map(d => `<li>${d.doctor}（${d.count} 件）</li>`).join("")}
            </ul>

            <!-- Treatment Top 3 -->
            <h4>🔥 熱門療程 Top 3</h4>
            <ul>
                ${report.treatmentTop3.map(t => `<li>${t.name}（${t.count} 件）</li>`).join("")}
            </ul>

            <!-- Trend Summary -->
            <h4>📈 AI 趨勢摘要</h4>
            <pre class="trend-box">${report.trendSummary}</pre>
        </div>
    `;
}

