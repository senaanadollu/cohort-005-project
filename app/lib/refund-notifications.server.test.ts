import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "./refunds.server";
import { dispatchPendingNotifications } from "./notification-dispatcher.server";
import { setDispatcherKick } from "./notifications.server";
import type { KnockSender, WorkflowTrigger } from "./knock.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date();

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let pat: typeof schema.users.$inferSelect;
let sam: typeof schema.users.$inferSelect;

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function individualPurchase(userId: number) {
  const purchase = db
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
  return purchase;
}

function teamLicence(userId: number) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 15800 })
    .returning()
    .get();
  for (const i of [0, 1]) {
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${i}`,
        purchaseId: purchase.id,
      })
      .run();
  }
  return purchase;
}

function raise(purchaseId: number, buyerId: number) {
  const result = raiseRefundRequest(db, purchaseId, buyerId, "Not for me.", NOW);
  if (!result.ok) throw new Error(result.error);
  return result.refundRequestId;
}

function rows() {
  return db.select().from(schema.pendingNotifications).all();
}

function keys() {
  return rows().map((row) => row.idempotencyKey);
}

async function dispatch() {
  const sent: { workflowKey: string; trigger: WorkflowTrigger }[] = [];
  const sender: KnockSender = {
    async trigger(workflowKey, trigger) {
      sent.push({ workflowKey, trigger });
      return { status: 200, body: { workflow_run_id: "run-1" } };
    },
  };
  await dispatchPendingNotifications(db, sender, () => {});
  return sent;
}

function recipientIds(trigger: WorkflowTrigger) {
  return trigger.recipients.map((person) => person.id).sort();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  pat = addUser("Pat", UserRole.Admin);
  sam = addUser("Sam", UserRole.Admin);
});

describe("recording Refund Request Notifications", () => {
  it("raising records refund-request-opened:<id> and kicks the dispatcher", () => {
    const kick = vi.fn();
    setDispatcherKick(kick);
    const purchase = individualPurchase(base.user.id);

    const id = raise(purchase.id, base.user.id);

    expect(keys()).toEqual([`refund-request-opened:${id}`]);
    expect(kick).toHaveBeenCalledTimes(1);
    setDispatcherKick(undefined);
  });

  it("approving records refund-request-approved:<id>", () => {
    const id = raise(individualPurchase(base.user.id).id, base.user.id);

    const result = approveRefundRequest(db, id, pat.id, null, NOW);

    expect(result.ok).toBe(true);
    expect(keys()).toContain(`refund-request-approved:${id}`);
    expect(keys()).toHaveLength(2);
  });

  it("declining records refund-request-declined:<id>", () => {
    const id = raise(individualPurchase(base.user.id).id, base.user.id);

    const result = declineRefundRequest(db, id, pat.id, "Outside policy.", NOW);

    expect(result.ok).toBe(true);
    expect(keys()).toContain(`refund-request-declined:${id}`);
    expect(keys()).toHaveLength(2);
  });

  it("records nothing when raising fails", () => {
    const purchase = individualPurchase(base.user.id);
    raise(purchase.id, base.user.id);
    const before = rows().length;

    const again = raiseRefundRequest(db, purchase.id, base.user.id, "Again", NOW);
    const stranger = raiseRefundRequest(db, purchase.id, sam.id, "Hi", NOW);

    expect(again.ok).toBe(false);
    expect(stranger.ok).toBe(false);
    expect(rows()).toHaveLength(before);
  });

  it("records nothing when a decision fails", () => {
    const id = raise(individualPurchase(base.user.id).id, base.user.id);
    declineRefundRequest(db, id, pat.id, "No.", NOW);
    const before = rows().length;

    const second = approveRefundRequest(db, id, sam.id, null, NOW);
    const blankNote = declineRefundRequest(db, id, sam.id, "  ", NOW);

    expect(second.ok).toBe(false);
    expect(blankNote.ok).toBe(false);
    expect(rows()).toHaveLength(before);
  });

  it("records nothing when approving a claimed Team Licence is refused", () => {
    const purchase = teamLicence(base.user.id);
    const id = raise(purchase.id, base.user.id);
    db.update(schema.coupons)
      .set({ redeemedByUserId: sam.id, redeemedAt: NOW.toISOString() })
      .where(eq(schema.coupons.code, "SEAT-0"))
      .run();
    const before = rows().length;

    const result = approveRefundRequest(db, id, pat.id, null, NOW);

    expect(result.ok).toBe(false);
    expect(rows()).toHaveLength(before);
  });
});

describe("dispatching Refund Request Notifications", () => {
  it("opened goes to every Platform Admin, with the buyer as actor", async () => {
    const id = raise(individualPurchase(base.user.id).id, base.user.id);

    const sent = await dispatch();

    expect(sent).toHaveLength(1);
    expect(sent[0].workflowKey).toBe("refund-request-opened");
    expect(recipientIds(sent[0].trigger)).toEqual(
      [String(pat.id), String(sam.id)].sort()
    );
    expect(sent[0].trigger.actor?.id).toBe(String(base.user.id));
    expect(sent[0].trigger.data).toEqual({
      refund_request_id: id,
      course_id: base.course.id,
      course_title: "Test Course",
      amount: 7900,
      reason: "Not for me.",
      target_path: `/admin/refunds?refundRequest=${id}`,
    });
  });

  it("opened drops a Platform Admin who raised it themselves", async () => {
    raise(individualPurchase(pat.id).id, pat.id);

    const sent = await dispatch();

    expect(recipientIds(sent[0].trigger)).toEqual([String(sam.id)]);
  });

  it("opened reads the Platform Admins at send time", async () => {
    raise(individualPurchase(base.user.id).id, base.user.id);
    const late = addUser("Late", UserRole.Admin);
    db.update(schema.users)
      .set({ role: UserRole.Student })
      .where(eq(schema.users.id, sam.id))
      .run();

    const sent = await dispatch();

    expect(recipientIds(sent[0].trigger)).toEqual(
      [String(pat.id), String(late.id)].sort()
    );
  });

  it("approved goes to the Student for an Individual Purchase only", async () => {
    const id = raise(individualPurchase(base.user.id).id, base.user.id);
    await dispatch();
    approveRefundRequest(db, id, pat.id, "Done.", NOW);

    const sent = await dispatch();

    expect(sent).toHaveLength(1);
    expect(sent[0].workflowKey).toBe("refund-request-approved");
    expect(recipientIds(sent[0].trigger)).toEqual([String(base.user.id)]);
    expect(sent[0].trigger.actor?.id).toBe(String(pat.id));
    expect(sent[0].trigger.data).toEqual({
      refund_request_id: id,
      course_id: base.course.id,
      course_title: "Test Course",
      amount: 7900,
      decision_note: "Done.",
      target_path: `/settings?refundRequest=${id}`,
    });
  });

  it("declined goes to the Team Admin who bought a Team Licence, with the note", async () => {
    const id = raise(teamLicence(base.user.id).id, base.user.id);
    await dispatch();
    declineRefundRequest(db, id, pat.id, "Outside policy.", NOW);

    const sent = await dispatch();

    expect(sent).toHaveLength(1);
    expect(sent[0].workflowKey).toBe("refund-request-declined");
    expect(recipientIds(sent[0].trigger)).toEqual([String(base.user.id)]);
    expect(sent[0].trigger.data).toMatchObject({
      amount: 15800,
      decision_note: "Outside policy.",
      target_path: `/settings?refundRequest=${id}`,
    });
  });

  it("a decision notifies only the buyer, not the other Platform Admins", async () => {
    const id = raise(individualPurchase(base.user.id).id, base.user.id);
    await dispatch();
    declineRefundRequest(db, id, pat.id, "No.", NOW);

    const sent = await dispatch();

    expect(recipientIds(sent[0].trigger)).not.toContain(String(sam.id));
  });
});
