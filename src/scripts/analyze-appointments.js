const fs = require('fs');
const path = require('path');

// 設定檔案路徑
const csvPath = path.join(__dirname, '../../public/data/appointments.csv');

// 讀取 CSV
try {
    const data = fs.readFileSync(csvPath, 'utf8');
    const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
    
    // Parse Headers
    const headers = lines[0].split(',');
    
    // Parse Rows
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const record = {};
        headers.forEach((h, index) => {
            record[h.trim()] = values[index] ? values[index].trim() : '';
        });
        records.push(record);
    }

    // ============================================
    // Part 1: No-show Analysis (Doctor & Service)
    // ============================================
    
    const doctorStats = {};
    const serviceStats = {};

    records.forEach(r => {
        // Count for Doctor
        if (r.doctor_name && r.doctor_name !== 'nan') {
            if (!doctorStats[r.doctor_name]) doctorStats[r.doctor_name] = { total: 0, no_show: 0 };
            doctorStats[r.doctor_name].total++;
            if (r.status === 'no_show') doctorStats[r.doctor_name].no_show++;
        }

        // Count for Service (Treatment)
        if (r.service_item && r.service_item !== 'nan') {
            // service_item might be multiple separated by ';', take the first one or split
            // Simulating primary service
            const primaryService = r.service_item.split(';')[0].trim();
            if (primaryService) {
                if (!serviceStats[primaryService]) serviceStats[primaryService] = { total: 0, no_show: 0 };
                serviceStats[primaryService].total++;
                if (r.status === 'no_show') serviceStats[primaryService].no_show++;
            }
        }
    });

    // Calculate Rates & Sort (Min total > 10 to be significant)
    const MIN_SAMPLES = 5;

    const rankDoctors = Object.entries(doctorStats)
        .map(([name, stat]) => ({
            name,
            ...stat,
            rate: stat.total > 0 ? (stat.no_show / stat.total) : 0
        }))
        .filter(d => d.total >= MIN_SAMPLES)
        .sort((a, b) => b.rate - a.rate);

    const rankServices = Object.entries(serviceStats)
        .map(([name, stat]) => ({
            name,
            ...stat,
            rate: stat.total > 0 ? (stat.no_show / stat.total) : 0
        }))
        .filter(s => s.total >= MIN_SAMPLES)
        .sort((a, b) => b.rate - a.rate);

    // ============================================
    // Part 2: Future Prediction (2026-03)
    // ============================================

    // 1. Calculate Baseline (Completed Daily Average)
    const completedApps = records.filter(r => r.status === 'completed');
    // Simple average from all data (or filtered by recent if dates available)
    // Assuming CSV contains recent data.
    const baseline = completedApps.length > 0 ? (completedApps.length / 365) : 15; // Rough estimate if no date span logic
    
    // Better: Group by date to find real daily average
    const dailyCounts = {};
    completedApps.forEach(r => {
        if (!dailyCounts[r.date]) dailyCounts[r.date] = 0;
        dailyCounts[r.date]++;
    });
    const days = Object.keys(dailyCounts).length;
    const realBaseline = days > 0 ? (completedApps.length / days) : 15;

    // 2. Generate March 2026 Prediction
    const predictions = [];
    const startDate = new Date('2026-03-01');

    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat

        // Seasonality: March
        // Early March (Post-Feb): slightly low
        // Mid March (Women's Day 3/8): High
        // Late March: Normal
        let seasonalFactor = 1.0;
        const day = d.getDate();
        if (day <= 5) seasonalFactor = 0.9;
        else if (day >= 6 && day <= 10) seasonalFactor = 1.25; // Women's Day promo
        else seasonalFactor = 1.05; // Spring steady

        // Weekly factor
        let weekFactor = 1.0;
        if (dayOfWeek === 0 || dayOfWeek === 6) weekFactor = 1.3;
        if (dayOfWeek === 5) weekFactor = 1.2;

        const baseVal = Math.max(realBaseline, 10); // Ensure minimal base
        const predictedTotal = Math.round(baseVal * seasonalFactor * weekFactor * 1.5); // Total (incl cancel buffer)
        const predictedCompleted = Math.round(predictedTotal * 0.85); // 85% completion rate assumption

        let riskLevel = 'low';
        if (predictedCompleted >= 35) riskLevel = 'high'; // Capacity bottleneck
        else if (predictedCompleted >= 25) riskLevel = 'medium';

        predictions.push({
            date: dateStr,
            predicted_total: predictedTotal,
            predicted_completed: predictedCompleted,
            risk_level: riskLevel
        });
    }

    // Output to files for reliable retrieval
    fs.writeFileSync('analysis_result.json', JSON.stringify(predictions, null, 2), 'utf8');
    
    let report = "Top 3 Doctors with High No-show Rate:\n";
    rankDoctors.slice(0, 3).forEach((d, i) => {
        report += `${i+1}. ${d.name}: ${d.no_show}/${d.total} (${(d.rate*100).toFixed(1)}%)\n`;
    });
    report += "\nTop 3 Treatments with High No-show Rate:\n";
    rankServices.slice(0, 3).forEach((s, i) => {
        report += `${i+1}. ${s.name}: ${s.no_show}/${s.total} (${(s.rate*100).toFixed(1)}%)\n`;
    });
    fs.writeFileSync('analysis_report.txt', report, 'utf8');

    console.log("Analysis complete. Files written.");

} catch (err) {
    console.error("Error reading or processing CSV:", err);
}
