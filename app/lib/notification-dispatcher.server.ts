import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { pendingNotifications } from "~/db/schema";
import {
  knockUser,
  type KnockResponse,
  type KnockSender,
  type WorkflowTrigger,
} from "~/lib/knock.server";
import {
  notificationBuilders,
  type NotificationEvent,
} from "~/lib/notification-definitions.server";
import { setDispatcherKick, type Db } from "~/lib/notifications.server";

// ─── Dispatcher ───
// Sends pending_notifications rows to Knock (ADR 0013). Takes the database and
// the Knock sender as parameters, so tests pass an in-memory database and a
// fake sender. Started only by the server entry (startNotificationDispatcher).

type Row = typeof pendingNotifications.$inferSelect;
type Log = (line: string) => void;

// ─── Retry policy ───
// A network error, a 5xx or a 429 is retried with exponential backoff: the
// wait after attempt n is RETRY_BASE_MS * 2^(n-1), so ten attempts span about
// 12h45m. Knock caches a successful response for an idempotency key for 24
// hours, so no attempt is ever made more than RETRY_WINDOW_MS after the first,
// even when the server was down and the sweep is late. Any other 4xx fails the
// row on the first attempt.
export const MAX_ATTEMPTS = 10;
export const RETRY_BASE_MS = 90_000;
export const RETRY_WINDOW_MS = 20 * 60 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 30_000;

function retryable(response: KnockResponse) {
  return response.status === 429 || response.status >= 500;
}

function succeeded(response: KnockResponse) {
  return response.status >= 200 && response.status < 300;
}

// The one place the person who caused a Notification is taken off its
// recipients: nobody is notified of their own action.
export function recipientsWithoutActor(event: NotificationEvent) {
  return event.recipients.filter((person) => person.id !== event.actor.id);
}

function update(db: Db, row: Row, values: Partial<Row>) {
  db.update(pendingNotifications)
    .set(values)
    .where(
      and(
        eq(pendingNotifications.id, row.id),
        isNull(pendingNotifications.sentAt),
        isNull(pendingNotifications.failedAt)
      )
    )
    .run();
}

// Done: sent to Knock, or closed without a trigger because the subject is gone
// or nobody qualifies.
function close(db: Db, row: Row) {
  update(db, row, { sentAt: new Date().toISOString() });
}

function fail(db: Db, row: Row, reason: string) {
  update(db, row, { failedAt: new Date().toISOString() });
  console.error(
    `[notifications] ${row.idempotencyKey} failed after ${row.attempts} ` +
      `attempt(s), giving up: ${reason}`
  );
}

// Called after attempt number row.attempts failed in a way worth retrying.
function retryLater(db: Db, row: Row, reason: string) {
  const firstAttemptAt = new Date(row.firstAttemptAt ?? Date.now()).getTime();
  const next = Date.now() + RETRY_BASE_MS * 2 ** (row.attempts - 1);
  if (row.attempts >= MAX_ATTEMPTS || next > firstAttemptAt + RETRY_WINDOW_MS) {
    fail(db, row, reason);
    return;
  }
  update(db, row, { nextAttemptAt: new Date(next).toISOString() });
  console.error(
    `[notifications] ${row.idempotencyKey} attempt ${row.attempts} failed, ` +
      `retrying at ${new Date(next).toISOString()}: ${reason}`
  );
}

const savedUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatar: z.string().optional(),
});
const savedTrigger: z.ZodType<WorkflowTrigger> = z.object({
  actor: savedUser,
  recipients: z.array(savedUser),
  data: z.record(z.string(), z.unknown()),
});

// appUrl, when given, travels as `app_url`: the email templates prefix it to
// `target_path` for the button, so the feed keeps a path and the email gets a
// full address.
function buildTrigger(
  event: NotificationEvent,
  appUrl: string | undefined
): WorkflowTrigger | undefined {
  const recipients = recipientsWithoutActor(event);
  if (recipients.length === 0) return undefined;
  return {
    actor: knockUser(event.actor),
    recipients: recipients.map(knockUser),
    data:
      appUrl === undefined ? event.data : { ...event.data, app_url: appUrl },
  };
}

// Reads the current data on every attempt, so a subject deleted since the
// last attempt closes the row. The body sent is the one saved before the
// first attempt: Knock rejects a reused idempotency key whose body differs,
// which would otherwise turn a renamed person into a failed row.
async function dispatchRow(
  db: Db,
  sender: KnockSender,
  pending: Row,
  log: Log,
  appUrl: string | undefined
) {
  const event = notificationBuilders[pending.type](db, pending.subjectId);
  const current = event ? buildTrigger(event, appUrl) : undefined;
  if (!current) {
    close(db, pending);
    return;
  }

  // A sweep running late, e.g. after the server was down, must not send past
  // the window either.
  if (
    pending.firstAttemptAt &&
    Date.now() > new Date(pending.firstAttemptAt).getTime() + RETRY_WINDOW_MS
  ) {
    fail(db, pending, "retry window passed before the next attempt");
    return;
  }

  const trigger = pending.trigger
    ? savedTrigger.parse(JSON.parse(pending.trigger))
    : current;
  const row: Row = {
    ...pending,
    attempts: pending.attempts + 1,
    firstAttemptAt: pending.firstAttemptAt ?? new Date().toISOString(),
    trigger: pending.trigger ?? JSON.stringify(trigger),
  };
  // Saved before sending, so an attempt cut off by a crash still counts and
  // the retry sends the same body.
  update(db, pending, {
    attempts: row.attempts,
    firstAttemptAt: row.firstAttemptAt,
    trigger: row.trigger,
  });

  let response: KnockResponse;
  try {
    response = await sender.trigger(pending.type, trigger, row.idempotencyKey);
  } catch (error) {
    retryLater(db, row, `network error: ${String(error)}`);
    return;
  }
  log(
    `[notifications] ${row.type} → recipients [${trigger.recipients
      .map((person) => person.id)
      .join(", ")}] → ${response.status} ${JSON.stringify(response.body)}`
  );
  const reason = `${response.status} ${JSON.stringify(response.body)}`;
  if (succeeded(response)) close(db, row);
  else if (retryable(response)) retryLater(db, row, reason);
  else fail(db, row, reason);
}

// Sends every row that is due, oldest first: not yet sent, not failed, and
// either never tried or past its backoff. Never throws: a row whose dispatch
// breaks is logged and left for the next run.
export async function dispatchPendingNotifications(
  db: Db,
  sender: KnockSender,
  log: Log = console.log,
  appUrl?: string
): Promise<void> {
  const now = new Date().toISOString();
  const rows = db
    .select()
    .from(pendingNotifications)
    .where(
      and(
        isNull(pendingNotifications.sentAt),
        isNull(pendingNotifications.failedAt),
        or(
          isNull(pendingNotifications.nextAttemptAt),
          lte(pendingNotifications.nextAttemptAt, now)
        )
      )
    )
    .orderBy(asc(pendingNotifications.id))
    .all();

  for (const row of rows) {
    try {
      await dispatchRow(db, sender, row, log, appUrl);
    } catch (error) {
      console.error(
        `[notifications] ${row.idempotencyKey} could not be sent`,
        error
      );
    }
  }
}

// Called once, from the server entry. Registers the kick that services call
// after their transaction commits, sends anything already due, and sweeps
// every SWEEP_INTERVAL_MS for retries and rows left by a restart. A kick or
// sweep during a run queues one more run, so a new row is never missed.
// Returns a function that stops the dispatcher.
export function startNotificationDispatcher(
  db: Db,
  sender: KnockSender,
  log: Log = console.log,
  appUrl?: string
): () => void {
  let running = false;
  let again = false;

  async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await dispatchPendingNotifications(db, sender, log, appUrl);
      } while (again);
    } finally {
      running = false;
    }
  }

  // setImmediate: the poster's request finishes before any sending starts.
  const kick = () => {
    setImmediate(() => void run());
  };
  setDispatcherKick(kick);
  const sweep = setInterval(kick, SWEEP_INTERVAL_MS);
  // The sweep alone never keeps the process alive.
  sweep.unref();
  kick();
  return () => {
    clearInterval(sweep);
    setDispatcherKick(undefined);
  };
}
