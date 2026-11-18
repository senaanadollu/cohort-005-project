import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { NotificationType, pendingNotifications } from "~/db/schema";

// ─── Recording Notifications ───
// A service that causes a Notification never calls Knock (ADR 0013). Inside
// its own transaction it calls recordNotification, and once that transaction
// has committed it calls kickDispatcher. The dispatcher
// (notification-dispatcher.server.ts) reads the current data and sends the row.

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Queryable = Db | Tx;

export { NotificationType };

export function idempotencyKey(
  type: NotificationType,
  subjectId: number
): string {
  return `${type}:${subjectId}`;
}

// Throws when the key is already taken, which rolls back the caller's
// transaction: one event can't be recorded twice.
export function recordNotification(
  tx: Queryable,
  type: NotificationType,
  subjectId: number
): void {
  tx.insert(pendingNotifications)
    .values({
      type,
      subjectId,
      idempotencyKey: idempotencyKey(type, subjectId),
    })
    .run();
}

// The server entry registers the running dispatcher here. Until it does (tests,
// scripts, a module imported on its own) a kick does nothing, so importing a
// service never starts sending.
let onKick: (() => void) | undefined;

export function setDispatcherKick(kick: (() => void) | undefined): void {
  onKick = kick;
}

// Call after the transaction that recorded a Notification has committed. Never
// throws and never waits on Knock.
export function kickDispatcher(): void {
  try {
    onKick?.();
  } catch (error) {
    console.error("[notifications] dispatcher kick failed", error);
  }
}
