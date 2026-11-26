import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudent, isEnrolled } from "~/lib/enrollments.server";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import { createPurchases } from "../index.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let purchases: ReturnType<typeof createPurchases>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  purchases = createPurchases(db);
});

describe("buying a Team Licence", () => {
  it("charges the per-Seat Purchasing-Power Price times the Seats and records the country and moment of sale", async () => {
    priceCourse(4999, true);

    const result = await purchases.buyTeamLicence(
      base.user.id,
      base.course.id,
      3,
      "IN",
      NOW
    );

    // 2500 cents a Seat at the 50% tier, for 3 Seats.
    expect(result).toMatchObject({
      ok: true,
      purchase: {
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7500,
        country: "IN",
        createdAt: NOW.toISOString(),
      },
    });
  });

  it("grants exactly the Seats bought, each with its own code", async () => {
    const result = await buy(base.user.id, 4);

    expect(result.seats).toHaveLength(4);
    expect(new Set(result.seats.map((s) => s.code)).size).toBe(4);
    for (const seat of result.seats) {
      expect(seat).toMatchObject({
        purchaseId: result.purchase.id,
        courseId: base.course.id,
        redeemedByUserId: null,
      });
    }
  });

  it("creates a team for a first Team Licence with the buyer as its Team Admin", async () => {
    const result = await buy(base.user.id, 2);

    expect(teamAdminsOf(result.team.id)).toEqual([base.user.id]);
    for (const seat of result.seats) expect(seat.teamId).toBe(result.team.id);
  });

  it("adds a second Team Licence's Seats to the team the Team Admin already runs", async () => {
    const first = await buy(base.user.id, 1);

    const second = await buy(base.user.id, 2);

    expect(second.team.id).toBe(first.team.id);
    for (const seat of second.seats) expect(seat.teamId).toBe(first.team.id);
    expect(teamAdminsOf(first.team.id)).toEqual([base.user.id]);
  });

  // Buying a Team Licence takes no Notifications port, so it can send no
  // Enrollment Notification.
  it("gives the Team Admin no Enrollment", async () => {
    await buy(base.user.id, 2);

    expect(isEnrolled(db, base.user.id, base.course.id)).toBe(false);
  });

  it("lets a Team Admin who is already enrolled buy a Team Licence", async () => {
    await enrollStudent(db, base.user.id, base.course.id, NOW, fakeNotifications());

    const result = await buy(base.user.id, 1);

    expect(result.seats).toHaveLength(1);
  });
});

describe("refusing a Team Licence", () => {
  it("refuses a course that is not Published and records nothing", async () => {
    db.update(schema.courses)
      .set({ status: schema.CourseStatus.Draft })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    expect(
      await purchases.buyTeamLicence(
        base.user.id,
        base.course.id,
        2,
        "GB",
        NOW
      )
    ).toEqual({ ok: false, reason: "not_published" });
    expect(db.select().from(schema.purchases).all()).toEqual([]);
    expect(db.select().from(schema.teams).all()).toEqual([]);
    expect(db.select().from(schema.coupons).all()).toEqual([]);
  });

  it.each([0, -1, 1.5])(
    "refuses %s Seats and records nothing",
    async (seats) => {
      expect(
        await purchases.buyTeamLicence(
          base.user.id,
          base.course.id,
          seats,
          "GB",
          NOW
        )
      ).toEqual({ ok: false, reason: "invalid_seat_count" });
      expect(db.select().from(schema.purchases).all()).toEqual([]);
    }
  );
});

async function buy(buyerId: number, seats: number) {
  const result = await purchases.buyTeamLicence(
    buyerId,
    base.course.id,
    seats,
    "GB",
    NOW
  );
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function teamAdminsOf(teamId: number) {
  return db
    .select({ userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, teamId),
        eq(schema.teamMembers.role, schema.TeamMemberRole.Admin)
      )
    )
    .all()
    .map((m) => m.userId);
}

function priceCourse(price: number, pppEnabled: boolean) {
  db.update(schema.courses)
    .set({ price, pppEnabled })
    .where(eq(schema.courses.id, base.course.id))
    .run();
}
