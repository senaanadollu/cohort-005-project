import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { isEnrolled } from "~/lib/enrollments.server";
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

describe("buying an Individual Purchase", () => {
  it("records the Purchase and gives the Student an Enrollment", async () => {
    const result = await purchases.buyIndividualPurchase(
      base.user.id,
      base.course.id,
      "GB",
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      purchase: { userId: base.user.id, courseId: base.course.id },
      enrollment: { userId: base.user.id, courseId: base.course.id },
    });
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
  });

  it("charges the Purchasing-Power Price for the buyer's country and records the country and moment of sale", async () => {
    priceCourse(4999, true);

    const result = await purchases.buyIndividualPurchase(
      base.user.id,
      base.course.id,
      "IN",
      NOW,
      notifications
    );

    // 4999 cents at the 50% tier is 2499.5, rounded once to 2500.
    expect(result).toMatchObject({
      ok: true,
      purchase: { amountPaid: 2500, country: "IN", createdAt: NOW.toISOString() },
      enrollment: { enrolledAt: NOW.toISOString() },
    });
  });

  it("charges the full price and records no country when the country is unknown", async () => {
    priceCourse(4999, true);

    const result = await purchases.buyIndividualPurchase(
      base.user.id,
      base.course.id,
      null,
      NOW,
      notifications
    );

    expect(result).toMatchObject({
      ok: true,
      purchase: { amountPaid: 4999, country: null },
    });
  });

  it("tells the course's Instructor that the Student enrolled", async () => {
    const result = await purchases.buyIndividualPurchase(
      base.user.id,
      base.course.id,
      "GB",
      NOW,
      notifications
    );
    if (!result.ok) throw new Error(result.reason);

    expect(notifications.sent).toEqual([
      {
        kind: "new-enrollment",
        recipient: expect.objectContaining({ id: base.instructor.id }),
        actor: expect.objectContaining({ id: base.user.id }),
        data: {
          enrollmentId: result.enrollment.id,
          courseId: base.course.id,
          courseTitle: base.course.title,
          url: `/instructor/${base.course.id}/students`,
        },
        idempotencyKey: `enrollment:${result.enrollment.id}`,
      },
    ]);
  });

  it("still records the Purchase and Enrollment when the Notification fails, and logs it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    notifications.failWith(new Error("Knock is down"));

    const result = await purchases.buyIndividualPurchase(
      base.user.id,
      base.course.id,
      "GB",
      NOW,
      notifications
    );

    expect(result.ok).toBe(true);
    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(true);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("enrollment:"),
      "Knock is down"
    );
    logged.mockRestore();
  });
});

function priceCourse(price: number, pppEnabled: boolean) {
  db.update(schema.courses)
    .set({ price, pppEnabled })
    .where(eq(schema.courses.id, base.course.id))
    .run();
}
