import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
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

// Makes the test database refuse a write, so a purchase fails part-way.
function failInsertsInto(table: string, afterRows = 0) {
  db.run(
    sql.raw(`CREATE TRIGGER fail_${table} BEFORE INSERT ON ${table}
      WHEN (SELECT count(*) FROM ${table}) >= ${afterRows}
      BEGIN SELECT RAISE(ABORT, 'database failed'); END`)
  );
}

describe("a purchase that fails part-way", () => {
  it("leaves no Individual Purchase when the Enrollment cannot be written", async () => {
    failInsertsInto("enrollments");

    await expect(
      purchases.buyIndividualPurchase(
        base.user.id,
        base.course.id,
        "GB",
        NOW,
        notifications
      )
    ).rejects.toThrow("database failed");
    expect(db.select().from(schema.purchases).all()).toEqual([]);
    expect(notifications.sent).toEqual([]);
  });

  it("leaves no Team Licence, team or Seat when a later Seat cannot be written", async () => {
    failInsertsInto("coupons", 2);

    await expect(
      purchases.buyTeamLicence(
        base.user.id,
        base.course.id,
        3,
        "GB",
        NOW
      )
    ).rejects.toThrow("database failed");
    expect(db.select().from(schema.purchases).all()).toEqual([]);
    expect(db.select().from(schema.teams).all()).toEqual([]);
    expect(db.select().from(schema.teamMembers).all()).toEqual([]);
    expect(db.select().from(schema.coupons).all()).toEqual([]);
  });
});
