/**
 * 風險分析器測試範例
 * 
 * 用於驗證輸出格式是否符合規格
 */

import { analyzeStaffRisks, RoleUtilization, WeeklyAggregates } from '../src/logic/staff/staffRiskAnalyzer.js';

// 測試資料 1: 醫師超載 + 複合療程集中
const testData1: { utilization: RoleUtilization[], aggregates: WeeklyAggregates } = {
  utilization: [
    {
      role: 'doctor',
      usedHours: 245.6,
      totalHours: 224,
      pct_display: 100,
      pct_raw: 109.6,
      overloadHours: 21.6
    },
    {
      role: 'therapist',
      usedHours: 312.8,
      totalHours: 672,
      pct_display: 47,
      pct_raw: 46.5
    },
    {
      role: 'nurse',
      usedHours: 156.2,
      totalHours: 448,
      pct_display: 35,
      pct_raw: 34.9
    },
    {
      role: 'consultant',
      usedHours: 89.3,
      totalHours: 224,
      pct_display: 40,
      pct_raw: 39.9
    }
  ],
  aggregates: {
    by_role_day: [
      {
        date: '2025-12-23',
        role: 'doctor',
        total_visits: 28,
        combo_visits: 17,
        combo_ratio: 60.7,
        high_focus_minutes: 190,
        total_minutes: 1680,
        cancelled: 2,
        no_show: 1
      },
      {
        date: '2025-12-24',
        role: 'doctor',
        total_visits: 25,
        combo_visits: 12,
        combo_ratio: 48.0,
        high_focus_minutes: 125,
        total_minutes: 1500,
        cancelled: 1,
        no_show: 0
      },
      {
        date: '2025-12-25',
        role: 'therapist',
        total_visits: 32,
        combo_visits: 8,
        combo_ratio: 25.0,
        high_focus_minutes: 85,
        total_minutes: 1920,
        cancelled: 8,
        no_show: 3
      }
    ],
    top_slots: [
      {
        date: '2025-12-23',
        time_bucket: '14:00-18:00',
        role: 'doctor',
        total_minutes: 480,
        high_focus_minutes: 190,
        combo_ratio: 65
      }
    ]
  }
};

// 測試資料 2: 正常負載但有波動風險
const testData2: { utilization: RoleUtilization[], aggregates: WeeklyAggregates } = {
  utilization: [
    {
      role: 'doctor',
      usedHours: 178.5,
      totalHours: 224,
      pct_display: 80,
      pct_raw: 79.7
    },
    {
      role: 'therapist',
      usedHours: 425.6,
      totalHours: 672,
      pct_display: 63,
      pct_raw: 63.3
    }
  ],
  aggregates: {
    by_role_day: [
      {
        date: '2025-12-26',
        role: 'doctor',
        total_visits: 20,
        combo_visits: 7,
        combo_ratio: 35.0,
        high_focus_minutes: 95,
        total_minutes: 1200,
        cancelled: 4,
        no_show: 2
      },
      {
        date: '2025-12-27',
        role: 'therapist',
        total_visits: 30,
        combo_visits: 5,
        combo_ratio: 16.7,
        high_focus_minutes: 60,
        total_minutes: 1800,
        cancelled: 7,
        no_show: 2
      }
    ],
    top_slots: []
  }
};

// 執行測試
console.log('═══════════════════════════════════════════════');
console.log('測試案例 1: 醫師超載 + 複合療程集中');
console.log('═══════════════════════════════════════════════');
const report1 = analyzeStaffRisks(testData1.utilization, testData1.aggregates, '本週');
console.log(JSON.stringify(report1, null, 2));

console.log('\n\n');

console.log('═══════════════════════════════════════════════');
console.log('測試案例 2: 正常負載但有波動風險');
console.log('═══════════════════════════════════════════════');
const report2 = analyzeStaffRisks(testData2.utilization, testData2.aggregates, '下週');
console.log(JSON.stringify(report2, null, 2));

console.log('\n\n');

// 驗證格式
console.log('═══════════════════════════════════════════════');
console.log('格式驗證');
console.log('═══════════════════════════════════════════════');
console.log('✓ summary.capacity_notes 數量:', report1.summary.capacity_notes.length, '/ 2');
console.log('✓ summary.risk_notes 數量:', report1.summary.risk_notes.length, '/ 2');
console.log('✓ alerts 數量:', report1.alerts.length, '/ 5');
console.log('✓ actions 數量:', report1.actions.length, '/ 5');
console.log('✓ review_list 數量:', report1.review_list.length, '/ 8');

// 驗證必要欄位
console.log('\n必要欄位檢查:');
const alert = report1.alerts[0];
if (alert) {
  console.log('✓ alert.level:', alert.level, '(red/yellow)');
  console.log('✓ alert.type:', alert.type);
  console.log('✓ alert.when:', alert.when);
  console.log('✓ alert.who:', alert.who);
  console.log('✓ alert.evidence:', alert.evidence);
  console.log('✓ alert.why_it_matters:', alert.why_it_matters);
}

const action = report1.actions[0];
if (action) {
  console.log('✓ action.action:', action.action);
  console.log('✓ action.target:', action.target);
  console.log('✓ action.purpose:', action.purpose);
}

console.log('\n測試完成! ✅');
