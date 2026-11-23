# Record Notifications in SQLite before sending them to Knock

A service that causes a Notification does not call Knock. It writes a row to a `pending_notifications` table in the same transaction as the event itself, and a dispatcher inside the server process sends pending rows to Knock and retries the ones that fail. We chose this so that the person's action never fails or waits because of Knock, and so that a Notification Cadence owes someone, such as the email telling a buyer their Refund Request was decided, is not lost when Knock is down or the server restarts.

Each row holds only the Notification type, the id of the thing that happened and an idempotency key built from the two. The dispatcher reads the current data and works out the recipients when it sends, and passes the key to Knock so a retry cannot notify twice.

## Considered Options

- **Call Knock inline in the route action.** Rejected: the action waits on Knock, and a failure either breaks an action that has already been saved or is swallowed and the Notification is lost.
- **Call Knock in the background and retry in memory.** Rejected: anything still pending is lost on a restart or deploy.
- **An external queue.** Rejected: a second service to sign up for and run, for seven low-volume Notifications.

## Consequences

The dispatcher relies on Cadence being one long-lived server process ([ADR 0006](./0006-one-sqlite-file-through-drizzle.md)); on serverless hosting or more than one machine it would need a separate worker and row claiming. Knock remembers an idempotency key for 24 hours, so retries must stop inside that window. Every write that causes a Notification has to live in a service function that owns the transaction, not inline in a route.
