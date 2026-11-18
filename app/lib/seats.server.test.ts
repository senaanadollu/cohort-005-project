import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdminId: number;
let purchaseId: number;

const NOW = new Date("2026-03-10T12:00:00Z");

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  teamAdminId = db
    .insert(schema.users)
    .values({
      name: "Team Admin",
      email: "admin@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get().id;

  purchaseId = db
    .insert(schema.purchases)
    .values({
      userId: teamAdminId,
      courseId: base.course.id,
      amountPaid: 9900,
      country: "US",
    })
    .returning()
    .get().id;

  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: "SEAT-1",
      purchaseId,
    })
    .run();
});

function enrollmentsOf(userId: number) {
  return db
    .select()
    .from(schema.enrollments)
    .all()
    .filter((enrollment) => enrollment.userId === userId);
}

function seat() {
  return db.select().from(schema.coupons).get();
}

describe("claimSeat", () => {
  it("claims the Seat and gives the Student an Enrollment", () => {
    const result = claimSeat(db, "SEAT-1", base.user.id, "US", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
    });
    expect(seat()).toMatchObject({
      redeemedByUserId: base.user.id,
      redeemedAt: NOW.toISOString(),
    });
    expect(enrollmentsOf(base.user.id)).toHaveLength(1);
  });

  it("lets a Lapsed Student enrol again", () => {
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: createLesson(),
        status: schema.LessonProgressStatus.Completed,
      })
      .run();

    const result = claimSeat(db, "SEAT-1", base.user.id, "US", NOW);

    expect(result.ok).toBe(true);
    expect(enrollmentsOf(base.user.id)).toHaveLength(1);
  });

  it("refuses an unknown code", () => {
    expect(claimSeat(db, "NOPE", base.user.id, "US", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });

  it("refuses a Claimed Seat", () => {
    claimSeat(db, "SEAT-1", base.user.id, "US", NOW);

    expect(claimSeat(db, "SEAT-1", base.instructor.id, "US", NOW)).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses a Student who is already enrolled, leaving the Seat unclaimed", () => {
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    expect(claimSeat(db, "SEAT-1", base.user.id, "US", NOW)).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(seat()?.redeemedAt).toBeNull();
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", () => {
    db.insert(schema.refunds)
      .values({ purchaseId, reason: "Changed plans" })
      .run();

    expect(claimSeat(db, "SEAT-1", base.user.id, "US", NOW)).toEqual({
      ok: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
  });

  it("refuses a claim from a different country than the buyer's", () => {
    expect(claimSeat(db, "SEAT-1", base.user.id, "DE", NOW)).toEqual({
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });
    expect(seat()?.redeemedAt).toBeNull();
  });

  it("leaves the Seat unclaimed when the Enrollment can't be written", () => {
    failInsertsInto("enrollments");

    expect(() =>
      claimSeat(db, "SEAT-1", base.user.id, "US", NOW)
    ).toThrow();
    expect(seat()?.redeemedByUserId).toBeNull();
    expect(seat()?.redeemedAt).toBeNull();
    expect(enrollmentsOf(base.user.id)).toHaveLength(0);
  });
});

function createLesson() {
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
}

/** Makes every insert into `table` fail, to break a write part-way. */
function failInsertsInto(table: string) {
  db.$client.exec(
    `CREATE TRIGGER fail_${table} BEFORE INSERT ON ${table}
     BEGIN SELECT RAISE(ABORT, 'insert into ${table} failed'); END;`
  );
}
