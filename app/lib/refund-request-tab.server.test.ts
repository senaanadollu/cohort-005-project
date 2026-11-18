import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus } from "~/db/schema";
import { findRefundRequestStatus } from "./refund-request-tab.server";

let db: ReturnType<typeof createTestDb>;
let purchaseId: number;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  purchaseId = db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid: 7900,
    })
    .returning()
    .get().id;
});

function addRefundRequest(status: RefundStatus) {
  return db
    .insert(schema.refunds)
    .values({ purchaseId, reason: "Not for me", status })
    .returning()
    .get().id;
}

describe("findRefundRequestStatus", () => {
  it.each([RefundStatus.Open, RefundStatus.Approved, RefundStatus.Declined])(
    "finds the status tab holding a %s Refund Request",
    (status) => {
      const id = addRefundRequest(status);
      expect(findRefundRequestStatus(db, id)).toBe(status);
    }
  );

  it("is null when the Refund Request no longer exists", () => {
    expect(findRefundRequestStatus(db, 9999)).toBeNull();
  });
});
