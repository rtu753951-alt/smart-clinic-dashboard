const fs = require('fs');

const appointments = [];
const text = fs.readFileSync('public/data/appointments.csv', 'utf8');
const lines = text.split('\n');

const months = new Set();
for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = lines[i].split(',');
    if (cols[2] && cols[2].length >= 7) {
        months.add(cols[2].substring(0, 7));
    }
}

const sortedMonths = Array.from(months).sort();
console.log("Found months in CSV:", sortedMonths);
