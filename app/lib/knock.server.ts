// ─── Knock sender ───
// The one place Cadence calls Knock's trigger API. The dispatcher takes a
// KnockSender as a parameter, the way the mailer takes a MailTransport, so
// tests pass a fake and never call Knock.

// A person identified inline on a trigger. The Knock user id is the Cadence
// user id as a string. Bio and role stay in Cadence.
export type KnockUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

export type WorkflowTrigger = {
  actor: KnockUser;
  recipients: KnockUser[];
  data: Record<string, unknown>;
};

// Knock's HTTP status and parsed body. A sender only throws when no response
// came back at all (network error).
export type KnockResponse = { status: number; body: unknown };

export interface KnockSender {
  trigger(
    workflowKey: string,
    trigger: WorkflowTrigger,
    idempotencyKey: string
  ): Promise<KnockResponse>;
}

export function knockUser(user: {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}): KnockUser {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
  };
}

const KNOCK_API = "https://api.knock.app/v1";

// The real sender. Thin on purpose: no test constructs it.
export function knockSender(apiKey: string): KnockSender {
  return {
    async trigger(workflowKey, trigger, idempotencyKey) {
      const response = await fetch(
        `${KNOCK_API}/workflows/${encodeURIComponent(workflowKey)}/trigger`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(trigger),
        }
      );
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON: keep the text.
      }
      return { status: response.status, body };
    },
  };
}

// Stands in for Knock outside production when there is no KNOCK_API_KEY. It
// prints the trigger it would have sent and answers as Knock would, so the
// dispatcher marks the row sent and nothing fires late once keys are added.
export function loggingSender(
  log: (line: string) => void = console.log
): KnockSender {
  return {
    async trigger(workflowKey, trigger, idempotencyKey) {
      log(
        `[notifications] no KNOCK_API_KEY, would trigger ${workflowKey} ` +
          `(${idempotencyKey}): ${JSON.stringify(trigger)}`
      );
      return { status: 200, body: { stand_in: true } };
    },
  };
}

// Picks the sender for this environment. Throws in production when the key is
// missing, so the server refuses to start rather than drop Notifications.
export function senderFromEnv(
  env: Record<string, string | undefined>,
  log?: (line: string) => void
): KnockSender {
  const apiKey = env.KNOCK_API_KEY;
  if (apiKey) return knockSender(apiKey);
  if (env.NODE_ENV === "production") {
    throw new Error(
      "KNOCK_API_KEY is not set. Cadence will not start in production " +
        "without it, because Notifications would be silently dropped."
    );
  }
  return loggingSender(log);
}

// ─── The site address in Notification emails ───
// The dispatcher sends Knock a target path; the email button prefixes it with
// APP_URL. Throws in production when it is missing, so the server refuses to
// start rather than send buttons that lead nowhere. Outside production it
// falls back to the local dev server.
const DEV_APP_URL = "http://localhost:5173";

export function appUrlFromEnv(env: Record<string, string | undefined>): string {
  const appUrl = env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");
  if (env.NODE_ENV === "production") {
    throw new Error(
      "APP_URL is not set. Cadence will not start in production without it, " +
        "because the buttons in Notification emails would have no address."
    );
  }
  return DEV_APP_URL;
}

// ─── Removing a Notification from the feed ───
// Knock has no endpoint that deletes a message. The documented way to make one
// leave a Notification Feed is to archive it. The trigger returns no message
// ids, so Cadence finds them by listing messages filtered by the trigger's
// data. KnockMessages is the injected seam for that, like KnockSender.

export type KnockMessage = { id: string; data: Record<string, unknown> };

export interface KnockMessages {
  // One page of messages sent by the workflow whose trigger data matches.
  list(
    workflowKey: string,
    triggerData: Record<string, unknown>,
    after?: string
  ): Promise<{ items: KnockMessage[]; next?: string }>;
  // Archives messages, which hides them from the default feed.
  archive(messageIds: string[]): Promise<void>;
}

// Archives every message the workflow sent for this comment and returns how
// many. Each message's own data is checked as well as Knock's filter: whether
// the filter matches a subset of the data (it does, checked against Knock) is
// not documented, and a loose match must never archive someone else's
// Notification.
export async function removeNotificationsFor(
  messages: KnockMessages,
  workflowKey: string,
  commentId: number
): Promise<number> {
  let archived = 0;
  let after: string | undefined;
  do {
    const page = await messages.list(
      workflowKey,
      { comment_id: commentId },
      after
    );
    const ids = page.items
      .filter((message) => message.data.comment_id === commentId)
      .map((message) => message.id);
    if (ids.length > 0) {
      await messages.archive(ids);
      archived += ids.length;
    }
    after = page.next;
  } while (after);
  return archived;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

// Reads one page of Knock's "list messages" answer, which holds the messages
// under `items` (the Management API and the feed use `entries`).
export function parseMessagePage(answer: unknown): {
  items: KnockMessage[];
  next?: string;
} {
  const body = asRecord(answer);
  const items = Array.isArray(body.items) ? body.items : [];
  const next = asRecord(body.page_info).after;
  return {
    items: items.map((item) => {
      const message = asRecord(item);
      return { id: String(message.id), data: asRecord(message.data) };
    }),
    next: typeof next === "string" && next ? next : undefined,
  };
}

// The real client. Thin on purpose: no test constructs it. feedChannelId, when
// set, limits the listing to feed messages.
export function knockMessages(
  apiKey: string,
  feedChannelId?: string
): KnockMessages {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  return {
    async list(workflowKey, triggerData, after) {
      const query = new URLSearchParams({
        source: workflowKey,
        trigger_data: JSON.stringify(triggerData),
        page_size: "50",
      });
      if (feedChannelId) query.set("channel_id", feedChannelId);
      if (after) query.set("after", after);
      const response = await fetch(`${KNOCK_API}/messages?${query}`, {
        headers,
      });
      if (!response.ok) {
        throw new Error(`Knock list messages answered ${response.status}`);
      }
      return parseMessagePage(await response.json());
    },
    async archive(messageIds) {
      const response = await fetch(`${KNOCK_API}/messages/batch/archived`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message_ids: messageIds }),
      });
      if (!response.ok) {
        throw new Error(`Knock archive messages answered ${response.status}`);
      }
    },
  };
}

// Stands in for Knock outside production when there is no KNOCK_API_KEY: finds
// nothing, and says so.
export function loggingMessages(
  log: (line: string) => void = console.log
): KnockMessages {
  return {
    async list(workflowKey, triggerData) {
      log(
        `[notifications] no KNOCK_API_KEY, would archive ${workflowKey} ` +
          `messages for ${JSON.stringify(triggerData)}`
      );
      return { items: [] };
    },
    async archive() {},
  };
}

export function messagesFromEnv(
  env: Record<string, string | undefined>,
  log?: (line: string) => void
): KnockMessages {
  const apiKey = env.KNOCK_API_KEY;
  if (apiKey) return knockMessages(apiKey, env.KNOCK_FEED_CHANNEL_ID);
  return loggingMessages(log);
}
