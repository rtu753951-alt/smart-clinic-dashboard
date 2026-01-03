/**
 * RFM Types
 * RFM 分析型別定義
 */

export type RFMScore = {
  recency: number;
  frequency: number;
  monetary: number;
};

export type RFMSegment =
  | 'high_value'
  | 'medium_value'
  | 'low_value';
