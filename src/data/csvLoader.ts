import { withBase } from "../utils/pathUtils.js";

export async function loadCSV<T>(path: string): Promise<T[]> {
  const fullPath = withBase(path);
  // console.log(`[CSV Loader] Fetching: ${fullPath} (Base: ${path})`);
  
  /* 
   * [Optimization] 增加 8 秒 Timeout 機制，避免 GitHub Pages 偶發連線懸掛 (Hanging)
   * 使用 AbortController 中止過久的請求
   */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
      const response = await fetch(fullPath, { signal: controller.signal });
      clearTimeout(timeoutId); // 清除計時器

      if (!response.ok) {
          console.warn(`[CSV Loader] ⚠️ Load failed: ${fullPath} (Status: ${response.status})`);
          // 不拋出錯誤，讓 Promise.all 能繼續，但需由呼叫端處理空資料
          throw new Error(`Failed to load ${path} (${response.status})`);
      }
      
      const csvText = await response.text();
      return parseCSVData<T>(csvText); // Refactored parsing logic below if needed, or inline

  } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
          console.warn(`[CSV Loader] ⏳ Timeout (8s): ${fullPath}`);
          throw new Error(`Timeout loading ${path}`);
      }
      console.warn(`[CSV Loader] ❌ Error loading ${path}:`, error);
      throw error;
  }
}

async function parseCSVData<T>(csvText: string): Promise<T[]> {

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
