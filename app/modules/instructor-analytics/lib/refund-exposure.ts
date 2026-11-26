import { eq } from "drizzle-orm";
import { courses, purchases } from "~/db/schema";
import { splitRevenue, type AnalyticsRange } from "~/lib/analytics";
import { calendarDay, lastDayOfWindow } from "~/lib/refunds.server";
import { purchaseScope, type Db } from "./scope";

// ─── Refund exposure ───
// Gross revenue is reported the moment a purchase lands, but a purchase is
// refundable for fourteen days, so some of what this page calls revenue is
// still the learner's money. This panel says how much of it is.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ExposedCourse = {
  courseId: number;
  title: string;
  grossCents: number;
  purchaseCount: number;
  daysLeft: number;
};

export type RefundExposure = {
  grossCents: number;
  netCents: number;
  purchaseCount: number;
  sharePercent: number;
  closingTodayCount: number;
  courses: ExposedCourse[];
};

/**
 * Every purchase in the range, then the ones still inside their refund
 * window, grouped up. `rangeGrossCents` is the range's whole gross revenue,
 * which the exposed share is a percentage of.
 */
export function getRefundExposure(
  db: Db,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date,
  rangeGrossCents: number
): RefundExposure {
  const exposureRows = db
    .select({
      courseId: courses.id,
      title: courses.title,
      amountPaid: purchases.amountPaid,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .all();

  const today = calendarDay(now);
  const exposedByCourse = new Map<number, ExposedCourse>();
  let exposedGrossCents = 0;
  let exposedPurchaseCount = 0;
  let closingTodayCount = 0;

  for (const row of exposureRows) {
    const lastDay = lastDayOfWindow(row.createdAt);
    if (today > lastDay) continue;

    // Whole days between today and the last day the learner may still ask.
    const daysLeft = Math.round(
      (new Date(`${lastDay}T00:00:00.000Z`).getTime() -
        new Date(`${today}T00:00:00.000Z`).getTime()) /
        MS_PER_DAY
    );

    exposedGrossCents += row.amountPaid;
    exposedPurchaseCount += 1;
    if (daysLeft === 0) closingTodayCount += 1;

    const existing = exposedByCourse.get(row.courseId);

    if (existing === undefined) {
      exposedByCourse.set(row.courseId, {
        courseId: row.courseId,
        title: row.title,
        grossCents: row.amountPaid,
        purchaseCount: 1,
        daysLeft,
      });
    } else {
      existing.grossCents += row.amountPaid;
      existing.purchaseCount += 1;
      // The course's headline is its most urgent purchase, not its newest.
      existing.daysLeft = Math.min(existing.daysLeft, daysLeft);
    }
  }

  return {
    grossCents: exposedGrossCents,
    netCents: splitRevenue(exposedGrossCents).netCents,
    purchaseCount: exposedPurchaseCount,
    sharePercent:
      rangeGrossCents === 0
        ? 0
        : Math.round((exposedGrossCents / rangeGrossCents) * 100),
    closingTodayCount,
    courses: [...exposedByCourse.values()].sort(
      (a, b) => b.grossCents - a.grossCents
    ),
  };
}
