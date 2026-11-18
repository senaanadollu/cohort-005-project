import { eq } from "drizzle-orm";
import { courses, purchases, refunds, users, UserRole } from "~/db/schema";
import type { NotificationEvent } from "~/lib/notification-definitions.server";
import type { Queryable } from "~/lib/notifications.server";

// ─── Refund Request Notifications ───
// What the three Refund Request Notifications say, and to whom. Registered in
// notification-definitions.server.ts. Subject: the Refund Request.

function findRefundRequest(db: Queryable, refundRequestId: number) {
  const row = db
    .select({
      refundRequest: refunds,
      purchase: purchases,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(purchases.id, refunds.purchaseId))
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(eq(refunds.id, refundRequestId))
    .get();
  if (!row) return null;
  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, row.purchase.userId))
    .get();
  return buyer ? { ...row, buyer } : null;
}

// Recipients: every Platform Admin at send time. Actor: the buyer, so a
// Platform Admin who raised it themselves is dropped by the dispatcher.
export function refundRequestOpened(
  db: Queryable,
  refundRequestId: number
): NotificationEvent | null {
  const found = findRefundRequest(db, refundRequestId);
  if (!found) return null;

  return {
    actor: found.buyer,
    recipients: db
      .select()
      .from(users)
      .where(eq(users.role, UserRole.Admin))
      .all(),
    data: {
      refund_request_id: refundRequestId,
      course_id: found.purchase.courseId,
      course_title: found.courseTitle,
      amount: found.purchase.amountPaid,
      reason: found.refundRequest.reason,
      target_path: `/admin/refunds?refundRequest=${refundRequestId}`,
    },
  };
}

// Recipient: the buyer only (the Student for an Individual Purchase, the Team
// Admin for a Team Licence). Actor: the Platform Admin who decided.
function refundRequestDecided(
  db: Queryable,
  refundRequestId: number
): NotificationEvent | null {
  const found = findRefundRequest(db, refundRequestId);
  if (!found || found.refundRequest.resolvedByUserId === null) return null;
  const decider = db
    .select()
    .from(users)
    .where(eq(users.id, found.refundRequest.resolvedByUserId))
    .get();
  if (!decider) return null;

  return {
    actor: decider,
    recipients: [found.buyer],
    data: {
      refund_request_id: refundRequestId,
      course_id: found.purchase.courseId,
      course_title: found.courseTitle,
      amount: found.purchase.amountPaid,
      decision_note: found.refundRequest.decisionNote,
      target_path: `/settings?refundRequest=${refundRequestId}`,
    },
  };
}

export const refundRequestApproved = refundRequestDecided;
export const refundRequestDeclined = refundRequestDecided;
