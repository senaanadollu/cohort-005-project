import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { fakeNotifications } from "~/lib/notifications.fake.server";
import {
  approveRefundRequest,
  raiseRefundRequest,
} from "~/lib/refunds.server";
import { claimSeat } from "~/lib/seat-claims.server";
import { createPurchases } from "../index.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let purchases: ReturnType<typeof createPurchases>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  purchases = createPurchases(db);
  // $100.00 with purchasing-power pricing switched on.
  db.update(schema.courses)
    .set({ price: 10000, pppEnabled: true })
    .where(eq(schema.courses.id, base.course.id))
    .run();
});

describe("the country check", () => {
  it("blocks a Student who bought at a Purchasing-Power Price when they play from another country", async () => {
    await buyForSelf(base.user.id, "IN");

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: true,
      purchaseCountry: "IN",
      country: "US",
    });
  });

  it.each(["PL", "IN", "NG"])(
    "blocks a discounted Purchase from %s in every discounted tier",
    async (purchaseCountry) => {
      await buyForSelf(base.user.id, purchaseCountry);

      expect(purchases.countryCheck(base.user.id, base.course.id, "GB")).toEqual({
        blocked: true,
        purchaseCountry,
        country: "GB",
      });
    }
  );

  it("lets a Student play a free course from any country", async () => {
    db.update(schema.courses)
      .set({ price: 0 })
      .where(eq(schema.courses.id, base.course.id))
      .run();
    await buyForSelf(base.user.id, "IN");

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: false,
    });
  });

  it("lets a Student who bought at a Purchasing-Power Price play in the country they bought in", async () => {
    await buyForSelf(base.user.id, "IN");

    expect(purchases.countryCheck(base.user.id, base.course.id, "IN")).toEqual({
      blocked: false,
    });
  });

  it("lets a Student who bought at full price play from any country", async () => {
    await buyForSelf(base.user.id, "GB");

    expect(purchases.countryCheck(base.user.id, base.course.id, "IN")).toEqual({
      blocked: false,
    });
  });

  it("lets a Student play from anywhere when their Purchase has no country", async () => {
    await buyForSelf(base.user.id, null);

    expect(purchases.countryCheck(base.user.id, base.course.id, "IN")).toEqual({
      blocked: false,
    });
  });

  it("lets a Student play from anywhere once the course has purchasing-power pricing switched off", async () => {
    await buyForSelf(base.user.id, "IN");
    db.update(schema.courses)
      .set({ pppEnabled: false })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: false,
    });
  });

  it("lets a Student play when the country they are in now is unknown", async () => {
    await buyForSelf(base.user.id, "IN");

    expect(purchases.countryCheck(base.user.id, base.course.id, null)).toEqual({
      blocked: false,
    });
  });
});

describe("which Purchase the country check reads", () => {
  it("ignores a Team Licence the Student bought as a Team Admin", async () => {
    await buyTeamLicence(base.user.id, "IN");
    await buyForSelf(base.user.id, "GB", later(1));

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: false,
    });
  });

  it("ignores an Individual Purchase with an Approved Refund Request", async () => {
    const refunded = await buyForSelf(base.user.id, "IN");
    await approveRefundRequestOn(refunded.id, base.user.id);
    await buyForSelf(base.user.id, "GB", later(1));

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: false,
    });
  });

  it("follows the newest standing Individual Purchase when there are several", async () => {
    await buyForSelf(base.user.id, "IN");
    endEnrollment(base.user.id);
    await buyForSelf(base.user.id, "GB", later(5));

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: false,
    });
  });

  it("decides newest by the moment of sale, not the order the Purchases were recorded", async () => {
    await buyForSelf(base.user.id, "IN", later(5));
    endEnrollment(base.user.id);
    await buyForSelf(base.user.id, "GB");

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: true,
      purchaseCountry: "IN",
      country: "US",
    });
  });

  it("does not block a Student enrolled through a Claimed Seat on a discounted Team Licence", async () => {
    const teamAdmin = addStudent("Priya");
    const { seats } = await buyTeamLicence(teamAdmin.id, "IN");
    const claimed = await claimSeat(
      db,
      seats[0].code,
      base.user.id,
      "IN",
      later(1),
      fakeNotifications()
    );
    if (!claimed.ok) throw new Error(claimed.error);

    expect(purchases.countryCheck(base.user.id, base.course.id, "US")).toEqual({
      blocked: false,
    });
  });
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

async function buyForSelf(studentId: number, country: string | null, when = NOW) {
  const result = await purchases.buyIndividualPurchase(
    studentId,
    base.course.id,
    country,
    when,
    fakeNotifications()
  );
  if (!result.ok) throw new Error(result.reason);
  return result.purchase;
}

async function buyTeamLicence(teamAdminId: number, country: string, when = NOW) {
  const result = await purchases.buyTeamLicence(
    teamAdminId,
    base.course.id,
    2,
    country,
    when
  );
  if (!result.ok) throw new Error(result.reason);
  return result;
}

async function approveRefundRequestOn(purchaseId: number, buyerId: number) {
  const raised = await raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "I bought it from the wrong country.",
    NOW,
    fakeNotifications()
  );
  if (!raised.ok) throw new Error(raised.error);
  const platformAdmin = db
    .insert(schema.users)
    .values({
      name: "Pat Admin",
      email: "pat@example.com",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();
  const approved = await approveRefundRequest(
    db,
    raised.refundRequestId,
    platformAdmin.id,
    null,
    NOW,
    fakeNotifications()
  );
  if (!approved.ok) throw new Error(approved.error);
}

// An Enrollment is not tied to a Purchase (ADR 0004), so it can end while
// the Purchase still stands, and the Student can buy the course again.
function endEnrollment(studentId: number) {
  db.delete(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, studentId),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .run();
}

function later(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() + days);
  return when;
}
