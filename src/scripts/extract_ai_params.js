const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../../public/data/appointments.csv');

try {
    const data = fs.readFileSync(csvPath, 'utf8');
    const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const record = {};
        headers.forEach((h, index) => {
            record[h] = values[index] ? values[index].trim() : '';
        });
        records.push(record);
    }

    // Filter relevant records (exclude cancelled for realization base if needed, 
    // but the definition says: realization = (completed + checked_in) / (total - cancelled)
    
    let totalValid = 0;
    let realizedCount = 0;
    
    const dailyCounts = {}; // YYYY-MM-DD -> count (for completed/checked_in only? or all valid?)
    // Usually "demand" weights are calculated based on ALL valid intentions (including no_show), 
    // OR based on actual realized load. 
    // Let's use "realized" load for weights to be conservative, or "total valid" to capture demand.
    // The previous prompt implied "Realization Rate" adjusts total, so weights should likely reflect "Total Valid" demand curve OR "Actual" curve.
    // Let's use "Realized" (completed + checked_in) for the factors to align with "Actual" curves.
    
    records.forEach(r => {
        if (r.status === 'cancelled') return;
        
        totalValid++;
        
        if (r.status === 'completed' || r.status === 'checked_in') {
            realizedCount++;
            
            if (!dailyCounts[r.date]) dailyCounts[r.date] = 0;
            dailyCounts[r.date]++;
        }
    });

    // 1. Avg Realization Rate
    const avgRealizationRate = totalValid > 0 ? (realizedCount / totalValid) : 0;

    // Daily Stats for Weights
    const dayOfWeekSums = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    const dayOfWeekCounts = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    
    const monthSums = {};
    const monthCounts = {};
    for(let m=1; m<=12; m++) { monthSums[m]=0; monthCounts[m]=0; }

    Object.keys(dailyCounts).forEach(dateStr => {
        const date = new Date(dateStr);
        const count = dailyCounts[dateStr];
        
        const day = date.getDay();
        const month = date.getMonth() + 1;
        
        dayOfWeekSums[day] += count;
        dayOfWeekCounts[day]++; // Number of Mondays, etc.
        
        monthSums[month] += count;
        monthCounts[month]++; // Number of days in Jan with data
    });

    // Calculate Average Daily Base (Global)
    const allDays = Object.values(dailyCounts).length;
    let totalVolume = 0;
    Object.values(dailyCounts).forEach(c => totalVolume += c);
    const globalDailyAvg = allDays > 0 ? totalVolume / allDays : 1;

    // 2. Day Weights
    const dayWeights = {};
    for(let d=0; d<=6; d++) {
        const avg = dayOfWeekCounts[d] > 0 ? dayOfWeekSums[d] / dayOfWeekCounts[d] : 0;
        dayWeights[d] = parseFloat((avg / globalDailyAvg).toFixed(3));
    }

    // 3. Monthly Factors
    const monthlyFactors = {};
    for(let m=1; m<=12; m++) {
        const avg = monthCounts[m] > 0 ? monthSums[m] / monthCounts[m] : 0;
        monthlyFactors[m] = parseFloat((avg / globalDailyAvg).toFixed(3));
    }

    const AI_PARAMS = {
        avgRealizationRate: parseFloat(avgRealizationRate.toFixed(4)),
        dayWeights,
        monthlyFactors
    };

    fs.writeFileSync('ai_params.json', JSON.stringify(AI_PARAMS, null, 2), 'utf8');
    console.log("JSON written to ai_params.json");

} catch (err) {
    console.error(err);
}
