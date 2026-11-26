import { count, eq, sql, sum } from "drizzle-orm";

import { courses, purchases } from "~/db/schema";
import { type AnalyticsRange, rangeStart, splitRevenue } from "~/lib/analytics";

import { type Db, purchaseScope } from "./scope";

// ─── Revenue ───
// What the viewer's courses earned in the range: in total, per course and
// over time.

export type RevenueSummary = {
  grossCents: number;
  feeCents: number;
  netCents: number;
  purchaseCount: number;
};

export type RevenuePoint = {
  bucket: string;
  grossCents: number;
  netCents: number;
};

export type RevenueSeries = {
  granularity: "day" | "month";
  points: RevenuePoint[];
};

/** Gross revenue, the platform's fee and the instructor's net for the range. */
export function getRevenueSummary(
  db: Db,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
): RevenueSummary {
  const summaryRow = db
    .select({
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .get();

  // sum() returns null over an empty set, and a string when SQLite has rows.
  return {
    ...splitRevenue(Number(summaryRow?.gross ?? 0)),
    purchaseCount: summaryRow?.purchaseCount ?? 0,
  };
}

/**
 * Revenue broken down by course, biggest earner first. Courses with no sales
 * in the range are absent rather than listed at zero.
 */
export function getCourseRevenue(
  db: Db,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
) {
  const courseRevenueRows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      gross: sum(purchases.amountPaid),
      purchaseCount: count(purchases.id),
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .groupBy(courses.id)
    .all();

  return courseRevenueRows
    .map((row) => ({
      courseId: row.courseId,
      title: row.title,
      ...splitRevenue(Number(row.gross ?? 0)),
      purchaseCount: row.purchaseCount,
    }))
    .sort((a, b) => b.grossCents - a.grossCents);
}

/** The bucket an ISO timestamp falls in, at the given granularity. */
function bucketOf(iso: string, granularity: "day" | "month"): string {
  return iso.slice(0, granularity === "day" ? 10 : 7);
}

/** Every bucket from `first` to `last` inclusive, with none skipped. */
function bucketRange(
  first: string,
  last: string,
  granularity: "day" | "month"
): string[] {
  const buckets: string[] = [];
  const cursor = new Date(
    `${first}${granularity === "day" ? "" : "-01"}T00:00:00.000Z`
  );

  while (bucketOf(cursor.toISOString(), granularity) <= last) {
    buckets.push(bucketOf(cursor.toISOString(), granularity));
    if (granularity === "day") {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } else {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  return buckets;
}

export function getRevenueOverTime(
  db: Db,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
): RevenueSeries {
  const granularity = range === "all" ? "month" : "day";
  const bucketExpr = sql<string>`substr(${purchases.createdAt}, 1, ${
    granularity === "day" ? 10 : 7
  })`;

  const rows = db
    .select({ bucket: bucketExpr, gross: sum(purchases.amountPaid) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr)
    .all();

  if (rows.length === 0 && range === "all") return { granularity, points: [] };

  const grossByBucket = new Map(
    rows.map((row) => [row.bucket, Number(row.gross ?? 0)])
  );

  // A fixed range always spans its whole window, even before the first sale;
  // all time can only start where the data does.
  const start = rangeStart(range, now) ?? rows[0].bucket;

  const points = bucketRange(
    bucketOf(start, granularity),
    bucketOf(now.toISOString(), granularity),
    granularity
  ).map((bucket) => {
    const { grossCents, netCents } = splitRevenue(
      grossByBucket.get(bucket) ?? 0
    );
    return { bucket, grossCents, netCents };
  });

  return { granularity, points };
}
