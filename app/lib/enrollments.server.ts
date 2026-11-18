import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { enrollments, purchases } from "~/db/schema";

// ─── Enrollments ───
// Creating an Enrollment, and the Individual Purchase that grants one. A Seat
// claim enrols through the same `enroll` (app/lib/seats.server.ts). See
// GLOSSARY.md for the language.
//
// Takes the database first, so tests can hand in an in-memory one. Uses
// positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Queryable = Db | Tx;

export type Enrollment = typeof enrollments.$inferSelect;
type Purchase = typeof purchases.$inferSelect;

export function findEnrollment(
  db: Queryable,
  userId: number,
  courseId: number
): Enrollment | undefined {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

/**
 * Gives a Student an Enrollment on a course, including a Lapsed Student
 * enrolling again. Every Enrollment is created here, inside the caller's
 * transaction (docs/adr/0013). The caller checks the Student isn't enrolled.
 */
export function enroll(
  tx: Queryable,
  userId: number,
  courseId: number
): Enrollment {
  return tx.insert(enrollments).values({ userId, courseId }).returning().get();
}

export type IndividualPurchaseResult =
  | { ok: true; purchase: Purchase; enrollment: Enrollment }
  | { ok: false; error: "already_enrolled" };

/** A Student buys a course for themselves: one Purchase and one Enrollment. */
export function makeIndividualPurchase(
  db: Db,
  buyerId: number,
  courseId: number,
  amountPaid: number,
  country: string | null
): IndividualPurchaseResult {
  return db.transaction((tx): IndividualPurchaseResult => {
    if (findEnrollment(tx, buyerId, courseId)) {
      return { ok: false, error: "already_enrolled" };
    }

    const purchase = tx
      .insert(purchases)
      .values({ userId: buyerId, courseId, amountPaid, country })
      .returning()
      .get();

    return { ok: true, purchase, enrollment: enroll(tx, buyerId, courseId) };
  });
}
