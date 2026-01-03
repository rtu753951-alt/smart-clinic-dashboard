/**
 * Customer Types
 * 顧客基礎型別定義
 */

export type Customer = {
  id: string;
  name: string;
  totalVisits: number;
  totalSpend: number;
  lastVisitDate: string;
};

export type CustomerSegment = 'new' | 'returning';
