import { and, desc, eq, notExists } from "drizzle-orm";
import {
  RefundStatus,
  coupons,
  courses,
  purchases,
  refunds,
} from "~/db/schema";
import type { Db } from "./db";
import { purchasingPowerPrice } from "./purchasing-power-price";

/**
 * Whether a Student may play a course in the country they are in now. When
 * blocked, it says which country they bought in and which they are in.
 */
export type CountryCheck =
  | { blocked: false }
  | { blocked: true; purchaseCountry: string; country: string };

export function countryCheck(
  db: Db,
  studentId: number,
  courseId: number,
  country: string | null
): CountryCheck {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  const purchase = db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, studentId),
        eq(purchases.courseId, courseId),
        // An Individual Purchase grants no Seats.
        notExists(
          db
            .select()
            .from(coupons)
            .where(eq(coupons.purchaseId, purchases.id))
        ),
        // A Purchase stands until a Refund Request on it is approved.
        notExists(
          db
            .select()
            .from(refunds)
            .where(
              and(
                eq(refunds.purchaseId, purchases.id),
                eq(refunds.status, RefundStatus.Approved)
              )
            )
        )
      )
    )
    // Newest first by the moment of sale (ISO text sorts in time order); the
    // later-recorded one wins a tie, so the answer is the same every time.
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
    .get();
  if (!course || !purchase?.country || !country) return { blocked: false };
  if (purchasingPowerPrice(course, purchase.country) >= course.price) {
    return { blocked: false };
  }
  if (purchase.country === country) return { blocked: false };

  return { blocked: true, purchaseCountry: purchase.country, country };
}
