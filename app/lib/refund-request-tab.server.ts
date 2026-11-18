import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { RefundStatus, refunds } from "~/db/schema";

/**
 * The status tab on the admin Refund Requests page that holds this Refund
 * Request right now, or null when it no longer exists. A link to a Refund
 * Request that has since been decided has to land on Approved or Declined.
 */
export function findRefundRequestStatus(
  db: BetterSQLite3Database<typeof schema>,
  refundRequestId: number
): RefundStatus | null {
  const row = db
    .select({ status: refunds.status })
    .from(refunds)
    .where(eq(refunds.id, refundRequestId))
    .get();
  return row?.status ?? null;
}
