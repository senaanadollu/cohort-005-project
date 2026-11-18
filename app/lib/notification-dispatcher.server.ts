import { and, asc, eq, isNull } from "drizzle-orm";
import { pendingNotifications } from "~/db/schema";
import { knockUser, type KnockSender } from "~/lib/knock.server";
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

// The one place the person who caused a Notification is taken off its
// recipients: nobody is notified of their own action.
export function recipientsWithoutActor(event: NotificationEvent) {
  return event.recipients.filter((person) => person.id !== event.actor.id);
}

function close(db: Db, row: Row) {
  db.update(pendingNotifications)
    .set({ sentAt: new Date().toISOString() })
    .where(
      and(
        eq(pendingNotifications.id, row.id),
        isNull(pendingNotifications.sentAt)
      )
    )
    .run();
}

async function dispatchRow(db: Db, sender: KnockSender, row: Row, log: Log) {
  const event = notificationBuilders[row.type](db, row.subjectId);
  const recipients = event ? recipientsWithoutActor(event) : [];
  if (!event || recipients.length === 0) {
    close(db, row);
    return;
  }

  const trigger = {
    actor: knockUser(event.actor),
    recipients: recipients.map(knockUser),
    data: event.data,
  };
  const response = await sender.trigger(row.type, trigger, row.idempotencyKey);
  log(
    `[notifications] ${row.type} → recipients [${trigger.recipients
      .map((person) => person.id)
      .join(", ")}] → ${response.status} ${JSON.stringify(response.body)}`
  );
  // Anything else stays pending. Retrying is the sweep's job.
  if (response.status >= 200 && response.status < 300) close(db, row);
}

// Sends every pending row once, oldest first. Never throws: a row that fails
// is logged and left pending.
export async function dispatchPendingNotifications(
  db: Db,
  sender: KnockSender,
  log: Log = console.log
): Promise<void> {
  const rows = db
    .select()
    .from(pendingNotifications)
    .where(isNull(pendingNotifications.sentAt))
    .orderBy(asc(pendingNotifications.id))
    .all();

  for (const row of rows) {
    try {
      await dispatchRow(db, sender, row, log);
    } catch (error) {
      console.error(
        `[notifications] ${row.idempotencyKey} could not be sent`,
        error
      );
    }
  }
}

// Called once, from the server entry. Registers the kick that services call
// after their transaction commits, and sends anything already pending. A kick
// during a run queues one more run, so a new row is never missed. Returns a
// function that stops the dispatcher.
export function startNotificationDispatcher(
  db: Db,
  sender: KnockSender,
  log: Log = console.log
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
        await dispatchPendingNotifications(db, sender, log);
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
  kick();
  return () => setDispatcherKick(undefined);
}
