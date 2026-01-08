export const KPI_VALID_STATUSES = ["completed", "paid", "booked", "checked_in"] as const;
export const IGNORED_STATUSES = ["cancelled", "no_show", "refunded", "error"] as const;

export const KPI_REVENUE_STATUSES = new Set(["completed", "paid", "checked_in"]);
export const KPI_EXCLUDE_STATUSES = new Set(["cancelled", "no_show", "refunded", "error"]);
