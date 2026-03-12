const fs = require('fs');

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' ) {
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCSVData(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length > 0) {
      lines[0] = lines[0].replace(/^\uFEFF/, '');
  }
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = parseCSVLine(line);
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = row[idx] ?? "";
    });
    data.push(record);
  }
  return data;
}

const csvText = fs.readFileSync('public/data/appointments.csv', 'utf8');
const appointments = parseCSVData(csvText);

console.log(`Total appointments parsed: ${appointments.length}`);

const statusCounts = {};
appointments.forEach(a => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
});

console.log("Status distribution:", statusCounts);

const dec2025 = appointments.filter(a => a.date.startsWith('2025-12'));
const nov2025 = appointments.filter(a => a.date.startsWith('2025-11'));
console.log(`Nov 2025: ${nov2025.length}`);
console.log(`Dec 2025: ${dec2025.length}`);

if (nov2025.length > 0) {
    console.log("Example Nov 2025:", nov2025[0]);
}
