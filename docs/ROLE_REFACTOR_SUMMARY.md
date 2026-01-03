/\*\*

- 角色命名一致性重構 - 完成總結
-
- 已完成的工作：
- 1.  ✅ 定義標準 StaffRole 型別（doctor | nurse | therapist | consultant）
- 2.  ✅ 移除 beauty_therapist 從型別定義
- 3.  ✅ 建立 roleUtils.ts 工具函數
- 4.  ✅ 更新 dataStore.ts 使用 normalizeRole
- 5.  ✅ 更新 kpiEngine.ts 移除 beauty_therapist 引用
-
- 需要手動修正的檔案：
- - src/logic/staff/staffWorkloadBars.ts
- - src/logic/staff/staffAggregator.ts
-
- 這兩個檔案因為 PowerShell 替換導致中文字符損壞，需要手動修正。
-
- 修正方式：
- 1.  打開檔案
- 2.  搜尋所有 "therapist"
- 3.  確認中文字符正確顯示為「醫師」「護理師」「美療師」「諮詢師」
- 4.  如果中文字符損壞，請手動修正
-
- 標準對照表：
- - doctor: "醫師"
- - nurse: "護理師"
- - therapist: "美療師"
- - consultant: "諮詢師"
    \*/

// 臨時解決方案：重新定義 ROLE_NAMES
export const ROLE_NAMES_FIX = {
doctor: "醫師",
consultant: "諮詢師",
nurse: "護理師",
therapist: "美療師"
};
