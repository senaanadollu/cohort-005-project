import { z } from "zod";

// ─── Knock from the browser ───
// The browser reads the Notification Feed (and, on Settings, the person's
// Notification Preferences) straight from Knock, with the public key and a
// user token the server signed for whoever is in the session.

export const KNOCK_BROWSER_API = "https://api.knock.app/v1";

export type NotificationFeedSession = {
  knockUserId: string;
  userToken: string;
  publicKey: string;
  feedChannelId: string;
};

// Every browser call to Knock carries the public key and the user token.
export function knockFetch(
  session: NotificationFeedSession,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<Response> {
  return fetch(`${KNOCK_BROWSER_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session.publicKey}`,
      "X-Knock-User-Token": session.userToken,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

// ─── Reading the feed ───

// One Notification as the feed panel uses it. The row's wording is built by
// Cadence from the workflow key and data (notification-rows.ts), never from a
// Knock template.
export type FeedItem = {
  id: string;
  workflowKey: string;
  insertedAt: string;
  seen: boolean;
  read: boolean;
  actorName: string | null;
  data: Record<string, unknown>;
};

export type Feed = {
  items: FeedItem[];
  unseenCount: number;
  unreadCount: number;
};

const entrySchema = z.object({
  id: z.string(),
  inserted_at: z.string(),
  seen_at: z.string().nullish(),
  read_at: z.string().nullish(),
  actors: z
    .array(z.object({ name: z.string().nullish() }).passthrough())
    .nullish(),
  source: z.object({ key: z.string() }).passthrough(),
  data: z.record(z.unknown()).nullish(),
});

const feedSchema = z.object({
  entries: z.array(z.unknown()),
  meta: z
    .object({
      unseen_count: z.number().optional(),
      unread_count: z.number().optional(),
    })
    .passthrough()
    .optional(),
});

// Knock's response is untrusted input: an entry that doesn't parse is
// dropped, and anything that isn't a feed gives null.
export function parseFeedResponse(json: unknown): Feed | null {
  const feed = feedSchema.safeParse(json);
  if (!feed.success) return null;

  const items: FeedItem[] = [];
  for (const raw of feed.data.entries) {
    const entry = entrySchema.safeParse(raw);
    if (!entry.success) continue;
    const e = entry.data;
    items.push({
      id: e.id,
      workflowKey: e.source.key,
      insertedAt: e.inserted_at,
      seen: Boolean(e.seen_at),
      read: Boolean(e.read_at),
      actorName: e.actors?.[0]?.name ?? null,
      data: e.data ?? {},
    });
  }

  return {
    items,
    unseenCount: feed.data.meta?.unseen_count ?? 0,
    unreadCount: feed.data.meta?.unread_count ?? 0,
  };
}
