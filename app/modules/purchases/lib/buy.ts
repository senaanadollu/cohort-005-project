import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import {
  CourseStatus,
  TeamMemberRole,
  coupons,
  courses,
  enrollments,
  purchases,
  teamMembers,
  teams,
} from "~/db/schema";
import {
  enrollStudentInTransaction,
  isEnrolled,
  notifyInstructorOfEnrollment,
} from "~/lib/enrollments.server";
import type { Notifications } from "~/lib/notifications.server";
import type { Db } from "./db";
import { purchasingPowerPrice } from "./purchasing-power-price";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type Purchase = typeof purchases.$inferSelect;
type Enrollment = typeof enrollments.$inferSelect;
type Course = typeof courses.$inferSelect;
type Team = typeof teams.$inferSelect;
type Seat = typeof coupons.$inferSelect;

/** Why a purchase was refused. Nothing is recorded when it is. */
export type PurchaseRefusal =
  | "course_not_found"
  | "not_published"
  | "already_enrolled";

export type IndividualPurchaseResult =
  | { ok: true; purchase: Purchase; enrollment: Enrollment }
  | { ok: false; reason: PurchaseRefusal };

export async function buyIndividualPurchase(
  db: Db,
  studentId: number,
  courseId: number,
  country: string | null,
  now: Date,
  notifications: Notifications
): Promise<IndividualPurchaseResult> {
  const result = db.transaction((tx): IndividualPurchaseResult => {
    const course = findPurchasableCourse(tx, courseId);
    if (!course.ok) return course;
    if (isEnrolled(tx, studentId, courseId)) {
      return { ok: false, reason: "already_enrolled" };
    }

    const purchase = insertPurchase(tx, studentId, course.course, country, now, 1);
    const enrolled = enrollStudentInTransaction(tx, studentId, courseId, now);
    // Checked above, so this only fails if the database changed under us;
    // throwing rolls the Purchase back.
    if (!enrolled.ok) throw new Error(enrolled.error);
    return { ok: true, purchase, enrollment: enrolled.enrollment };
  });
  if (result.ok) {
    await notifyInstructorOfEnrollment(db, result.enrollment, notifications);
  }
  return result;
}

export type TeamLicenceResult =
  | { ok: true; purchase: Purchase; team: Team; seats: Seat[] }
  | { ok: false; reason: TeamLicenceRefusal };

/** Why a Team Licence was refused. Nothing is recorded when it is. */
export type TeamLicenceRefusal =
  | Exclude<PurchaseRefusal, "already_enrolled">
  | "invalid_seat_count";

export async function buyTeamLicence(
  db: Db,
  teamAdminId: number,
  courseId: number,
  seats: number,
  country: string | null,
  now: Date
): Promise<TeamLicenceResult> {
  if (!Number.isInteger(seats) || seats < 1) {
    return { ok: false, reason: "invalid_seat_count" };
  }
  return db.transaction((tx): TeamLicenceResult => {
    const course = findPurchasableCourse(tx, courseId);
    if (!course.ok) return course;
    const purchase = insertPurchase(tx, teamAdminId, course.course, country, now, seats);
    const team = findOrCreateTeam(tx, teamAdminId, now);
    const granted = Array.from({ length: seats }, () =>
      tx
        .insert(coupons)
        .values({
          teamId: team.id,
          courseId,
          code: crypto.randomBytes(12).toString("base64url"),
          purchaseId: purchase.id,
          createdAt: now.toISOString(),
        })
        .returning()
        .get()
    );
    return { ok: true, purchase, team, seats: granted };
  });
}

function findOrCreateTeam(tx: Tx, teamAdminId: number, now: Date): Team {
  const existing = tx
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(
      and(
        eq(teamMembers.userId, teamAdminId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();
  if (existing) return existing.team;

  const team = tx
    .insert(teams)
    .values({ createdAt: now.toISOString() })
    .returning()
    .get();
  tx.insert(teamMembers)
    .values({
      teamId: team.id,
      userId: teamAdminId,
      role: TeamMemberRole.Admin,
      createdAt: now.toISOString(),
    })
    .run();
  return team;
}

// Read inside the buying transaction, so the charge never trusts a price
// from the caller.
function findPurchasableCourse(
  tx: Tx,
  courseId: number
):
  | { ok: true; course: Course }
  | { ok: false; reason: "course_not_found" | "not_published" } {
  const course = tx.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) return { ok: false, reason: "course_not_found" };
  if (course.status !== CourseStatus.Published) {
    return { ok: false, reason: "not_published" };
  }
  return { ok: true, course };
}

function insertPurchase(
  tx: Tx,
  buyerId: number,
  course: Course,
  country: string | null,
  now: Date,
  seats: number
): Purchase {
  return tx
    .insert(purchases)
    .values({
      userId: buyerId,
      courseId: course.id,
      amountPaid: purchasingPowerPrice(course, country) * seats,
      country,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
}
