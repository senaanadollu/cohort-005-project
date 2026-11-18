import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { makeIndividualPurchase } from "./enrollments.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("makeIndividualPurchase", () => {
  it("records the Purchase and gives the buyer an Enrollment", () => {
    const result = makeIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      "US"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.purchase).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 7900,
      country: "US",
    });
    expect(result.enrollment).toMatchObject({
      userId: base.user.id,
      courseId: base.course.id,
    });
  });

  it("refuses a buyer who is already enrolled, recording no Purchase", () => {
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    expect(
      makeIndividualPurchase(db, base.user.id, base.course.id, 7900, null)
    ).toEqual({ ok: false, error: "already_enrolled" });
    expect(db.select().from(schema.purchases).all()).toHaveLength(0);
  });

  it("records no Purchase when the Enrollment can't be written", () => {
    db.$client.exec(
      `CREATE TRIGGER fail_enrollments BEFORE INSERT ON enrollments
       BEGIN SELECT RAISE(ABORT, 'insert into enrollments failed'); END;`
    );

    expect(() =>
      makeIndividualPurchase(db, base.user.id, base.course.id, 7900, null)
    ).toThrow();
    expect(db.select().from(schema.purchases).all()).toHaveLength(0);
  });
});
