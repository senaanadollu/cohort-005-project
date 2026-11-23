import { eq } from "drizzle-orm";
import { coupons, purchases } from "~/db/schema";
import {
  enroll,
  findEnrollment,
  type Db,
  type Enrollment,
} from "~/lib/enrollments.server";
import {
  NotificationType,
  kickDispatcher,
  recordNotification,
} from "~/lib/notifications.server";
import { getSeatAvailability } from "~/lib/refunds.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence. See GLOSSARY.md for the
// language. Seats are stored in the `coupons` table.
//
// Takes the database first, so tests can hand in an in-memory one. Uses
// positional parameters (project convention).

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimSeatResult =
  | { ok: true; enrollment: Enrollment }
  | { ok: false; error: string };

/**
 * Claims the Seat with this code for a Student and enrols them, in one
 * transaction. `country` is the Student's, and must match the buyer's when the
 * Purchase recorded one.
 */
export function claimSeat(
  db: Db,
  code: string,
  studentId: number,
  country: string,
  now: Date
): ClaimSeatResult {
  const result = db.transaction((tx): ClaimSeatResult => {
    const seat = tx.select().from(coupons).where(eq(coupons.code, code)).get();
    if (!seat) {
      return { ok: false, error: "Coupon not found" };
    }

    if (seat.redeemedByUserId !== null) {
      return { ok: false, error: "Coupon has already been redeemed" };
    }

    const availability = getSeatAvailability(tx, seat);
    if (availability === "on_hold") {
      return { ok: false, error: SEAT_ON_HOLD };
    }
    if (availability === "refunded") {
      return { ok: false, error: SEAT_REFUNDED };
    }

    if (findEnrollment(tx, studentId, seat.courseId)) {
      return { ok: false, error: "You are already enrolled in this course" };
    }

    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, seat.purchaseId))
      .get();

    if (purchase?.country && purchase.country !== country) {
      return {
        ok: false,
        error:
          "This coupon can only be redeemed from the same country as the purchaser",
      };
    }

    tx.update(coupons)
      .set({ redeemedByUserId: studentId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();

    const enrollment = enroll(tx, studentId, seat.courseId);
    recordNotification(tx, NotificationType.SeatClaimed, seat.id);
    return { ok: true, enrollment };
  });
  if (result.ok) kickDispatcher();
  return result;
}
