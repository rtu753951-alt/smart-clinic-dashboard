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

    // Filter Date Range: 2024-01-01 to 2026-02-28
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2026-02-28');

    const validRecords = records.filter(r => {
        const d = new Date(r.date);
        return d >= startDate && d <= endDate;
    });

    console.log(`Analyzed Records: ${validRecords.length} (from ${records.length})`);

    // 1. Realization Rate
    // (completed + checked_in) / (Total - cancelled)
    let totalNonCancelled = 0;
    let realizedCount = 0;

    // Also collect daily counts for base calculation (using realized only)
    const dailyCounts = {}; 

    validRecords.forEach(r => {
        if (r.status === 'cancelled') return;

        totalNonCancelled++;
        
        if (r.status === 'completed' || r.status === 'checked_in') {
            realizedCount++;
            
            // Count for daily base & seasonality
            if (!dailyCounts[r.date]) dailyCounts[r.date] = 0;
            dailyCounts[r.date]++;
        }
    });

    const realizationRate = totalNonCancelled > 0 ? (realizedCount / totalNonCancelled) : 0;

    // 2. Average Daily Base (Realized)
    const totalDays = Object.keys(dailyCounts).length;
    let sumCounts = 0;
    Object.values(dailyCounts).forEach(c => sumCounts += c);
    const averageDailyBase = totalDays > 0 ? (sumCounts / totalDays) : 0;

    // 3. Seasonality Factors
    const monthCounts = {}; // { 1: [], 2: [], ... } stores daily counts
    const dayOfWeekCounts = {}; // { 0: [], 1: [], ... }

    // Initialize arrays
    for(let m=1; m<=12; m++) monthCounts[m] = [];
    for(let d=0; d<=6; d++) dayOfWeekCounts[d] = [];

    // Re-iterate dailyCounts to populate stats
    Object.keys(dailyCounts).forEach(dateStr => {
        const date = new Date(dateStr);
        const count = dailyCounts[dateStr];
        
        const month = date.getMonth() + 1; // 1-12
        const day = date.getDay(); // 0-6

        if(monthCounts[month]) monthCounts[month].push(count);
        if(dayOfWeekCounts[day]) dayOfWeekCounts[day].push(count);
    });

    // Calculate Factors
    // Monthly Factor = Average of that Month / Global Average Daily Base
    const monthlyFactors = {};
    for(let m=1; m<=12; m++) {
        const counts = monthCounts[m];
        if (counts.length > 0) {
            const avg = counts.reduce((a,b)=>a+b,0) / counts.length;
            monthlyFactors[m] = avg / averageDailyBase;
        } else {
            monthlyFactors[m] = 1.0;
        }
    }

    // Day of Week Factor = Average of that Day / Global Average Daily Base
    // Note: Usually Day factors are normalized so their average is 1.0, or relative to the 'Week average'.
    // Logic asked: "relative to weekly average". 
    // Global Average Daily Base IS roughly the weekly average / 7 if distributed evenly.
    // Yes, AvgDailyBase is the mean. So Avg(Day) / AvgDailyBase gives the factor.
    const dayWeights = {};
    for(let d=0; d<=6; d++) {
        const counts = dayOfWeekCounts[d];
        if (counts.length > 0) {
            const avg = counts.reduce((a,b)=>a+b,0) / counts.length;
            dayWeights[d] = avg / averageDailyBase;
        } else {
            dayWeights[d] = 1.0;
        }
    }

    const config = {
        realizationRate: parseFloat(realizationRate.toFixed(4)),
        monthlyFactors: Object.fromEntries(Object.entries(monthlyFactors).map(([k,v]) => [k, parseFloat(v.toFixed(3))])),
        dayWeights: Object.fromEntries(Object.entries(dayWeights).map(([k,v]) => [k, parseFloat(v.toFixed(3))])),
        averageDailyBase: parseFloat(averageDailyBase.toFixed(2))
    };

    fs.writeFileSync('forecast_config.json', JSON.stringify(config, null, 2), 'utf8');
    console.log("Config written to forecast_config.json");

} catch(err) {
    console.error(err);
}
