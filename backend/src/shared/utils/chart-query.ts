import { Op } from "sequelize";

export type ChartInterval = "1h" | "6h" | "1d" | "7d";

export const intervalHoursMap: Record<ChartInterval, number> = {
  "1h": 1,
  "6h": 6,
  "1d": 24,
  "7d": 24 * 7,
};

export function buildDateRangeWhere(fromDate?: string, toDate?: string) {
  const range = {
    ...(fromDate ? { [Op.gte]: new Date(fromDate) } : {}),
    ...(toDate ? { [Op.lte]: new Date(toDate) } : {}),
  };

  return Object.keys(range).length > 0 ? { createdAt: range } : {};
}

export function downsampleByInterval<T extends { createdAt: Date }>(
  rows: T[],
  interval: ChartInterval,
): T[] {
  if (rows.length === 0) {
    return rows;
  }

  const bucketMs = intervalHoursMap[interval] * 60 * 60 * 1000;
  const buckets = new Map<number, T>();

  for (const row of rows) {
    const bucketKey = Math.floor(row.createdAt.getTime() / bucketMs);
    buckets.set(bucketKey, row);
  }

  return Array.from(buckets.values()).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
