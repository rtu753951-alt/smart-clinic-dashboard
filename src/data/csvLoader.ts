export async function loadCSV<T>(path: string): Promise<T[]> {
  const response = await fetch(path);
  const csvText = await response.text();

  const lines = csvText.trim().split("\n");

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim()); // 去除每個 header 的空白字符（包括 \r）
  const data: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); // 去除整行的前後空白
    if (!line) continue; // 跳過空行
    
    const row = parseCSVLine(line);
    const record: any = {};

    headers.forEach((h, idx) => {
      record[h] = row[idx] ?? ""; // 確保空欄位不會變 undefined
    });

    data.push(record as T);
  }

  return data;
}

// 用正確的 CSV parser 來 split 每一行
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' ) {
      // 處理連續兩個引號 → 視為字串中的一個引號
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    }
    else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    }
    else {
      current += char;
    }
  }

  result.push(current);
  return result;
}
