import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudent } from "~/lib/enrollments.server";
import {
  fakeNotifications,
  type FakeNotifications,
} from "~/lib/notifications.fake.server";
import { createPurchases } from "../index.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let notifications: FakeNotifications;
let purchases: ReturnType<typeof createPurchases>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  notifications = fakeNotifications();
  purchases = createPurchases(db);
});

describe("refusing an Individual Purchase", () => {
  it("refuses a Student who is already enrolled and records no Purchase", async () => {
    await enrollStudent(db, base.user.id, base.course.id, NOW, fakeNotifications());

    expect(
      await purchases.buyIndividualPurchase(
        base.user.id,
        base.course.id,
        "GB",
        NOW,
        notifications
      )
    ).toEqual({ ok: false, reason: "already_enrolled" });
    expect(purchasesOnCourse()).toEqual([]);
    expect(notifications.sent).toEqual([]);
  });

  it("refuses a course that is not Published and records no Purchase or Enrollment", async () => {
    unpublishCourse();

    expect(
      await purchases.buyIndividualPurchase(
        base.user.id,
        base.course.id,
        "GB",
        NOW,
        notifications
      )
    ).toEqual({ ok: false, reason: "not_published" });
    expect(purchasesOnCourse()).toEqual([]);
    expect(enrollmentsOnCourse()).toEqual([]);
  });

  it("refuses a course that does not exist", async () => {
    expect(
      await purchases.buyIndividualPurchase(
        base.user.id,
        9999,
        "GB",
        NOW,
        notifications
      )
    ).toEqual({ ok: false, reason: "course_not_found" });
  });
});

function unpublishCourse() {
  db.update(schema.courses)
    .set({ status: schema.CourseStatus.Draft })
    .where(eq(schema.courses.id, base.course.id))
    .run();
}

function purchasesOnCourse() {
  return db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.courseId, base.course.id))
    .all();
}

function enrollmentsOnCourse() {
  return db
    .select()
    .from(schema.enrollments)
    .where(eq(schema.enrollments.courseId, base.course.id))
    .all();
}
