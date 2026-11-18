// PROTOTYPE — throwaway, for the wayfinder ticket
// "What does the Notification Feed look like in Cadence?".
// Three variants of the Notification Feed, mounted in the real app layout and
// switchable via `?variant=A|B|C`. Lives only on prototype/notification-feed.
//
// This file is the only thing the variants share: the live Knock feed (read
// straight from the browser with the public key + signed user token) and the
// wording of each Notification. Layout is each variant's own business.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const KNOCK_API = "https://api.knock.app/v1";
const POLL_MS = 5000;

export interface KnockConfig {
  knockUserId: string;
  userToken: string;
  publicKey: string;
  feedChannelId: string;
}

export interface FeedItem {
  id: string;
  kind: string;
  insertedAt: string;
  seen: boolean;
  read: boolean;
  actorName: string | null;
  subject: string;
  excerpt: string | null;
  url: string;
  data: Record<string, any>;
}

interface FeedState {
  items: FeedItem[];
  total: number;
  unread: number;
  unseen: number;
  loaded: boolean;
  lastCall: string;
  reload: () => void;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  markAllSeen: () => void;
  archiveAll: () => void;
}

const FeedContext = createContext<FeedState | null>(null);

export function useFeedOrNull() {
  return useContext(FeedContext);
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed outside FeedProvider");
  return ctx;
}

function toItem(e: any): FeedItem {
  const d = e.data ?? {};
  return {
    id: e.id,
    kind: e.source?.key ?? "unknown",
    insertedAt: e.inserted_at,
    seen: !!e.seen_at,
    read: !!e.read_at,
    actorName: e.actors?.[0]?.name ?? null,
    // Fallbacks cover items left in the feed by the earlier Knock spike.
    subject: d.subject ?? d.lesson_title ?? d.course_title ?? "",
    excerpt: d.excerpt ?? d.reply_excerpt ?? null,
    url: d.url ?? "/",
    data: d,
  };
}

export function FeedProvider({
  config,
  children,
}: {
  config: KnockConfig;
  children: ReactNode;
}) {
  const { knockUserId, userToken, publicKey, feedChannelId } = config;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, unread: 0, unseen: 0 });
  const [loaded, setLoaded] = useState(false);
  const [lastCall, setLastCall] = useState("");

  const knockFetch = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(`${KNOCK_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${publicKey}`,
          "X-Knock-User-Token": userToken,
          "Content-Type": "application/json",
        },
      }),
    [publicKey, userToken]
  );

  const reload = useCallback(async () => {
    const res = await knockFetch(
      `/users/${knockUserId}/feeds/${feedChannelId}?page_size=50`
    );
    if (!res.ok) return;
    const json = await res.json();
    setItems((json.entries ?? []).map(toItem));
    setMeta({
      total: json.meta?.total_count ?? 0,
      unread: json.meta?.unread_count ?? 0,
      unseen: json.meta?.unseen_count ?? 0,
    });
    setLoaded(true);
  }, [knockFetch, knockUserId, feedChannelId]);

  // No real-time socket in the prototype: poll.
  useEffect(() => {
    setLoaded(false);
    reload();
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const call = useCallback(
    async (method: string, path: string, body?: unknown) => {
      const res = await knockFetch(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      setLastCall(`${method} ${path} → ${res.status}`);
      reload();
    },
    [knockFetch, reload]
  );

  const value = useMemo<FeedState>(() => {
    const patch = (id: string | null, p: Partial<FeedItem>) =>
      setItems((xs) => xs.map((x) => (id === null || x.id === id ? { ...x, ...p } : x)));
    const ids = () => items.map((i) => i.id);
    return {
      items,
      ...meta,
      loaded,
      lastCall,
      reload,
      markRead: (id) => {
        const item = items.find((i) => i.id === id);
        if (!item || item.read) return;
        patch(id, { read: true, seen: true });
        setMeta((m) => ({ ...m, unread: Math.max(0, m.unread - 1) }));
        call("PUT", `/messages/${id}/read`);
      },
      markUnread: (id) => {
        patch(id, { read: false });
        setMeta((m) => ({ ...m, unread: m.unread + 1 }));
        call("DELETE", `/messages/${id}/read`);
      },
      markAllRead: () => {
        if (!items.some((i) => !i.read)) return;
        patch(null, { read: true, seen: true });
        setMeta((m) => ({ ...m, unread: 0, unseen: 0 }));
        call("POST", "/messages/batch/read", { message_ids: ids() });
      },
      markAllSeen: () => {
        if (!items.some((i) => !i.seen)) return;
        patch(null, { seen: true });
        setMeta((m) => ({ ...m, unseen: 0 }));
        call("POST", "/messages/batch/seen", { message_ids: ids() });
      },
      archiveAll: () => {
        if (items.length === 0) return;
        setItems([]);
        setMeta({ total: 0, unread: 0, unseen: 0 });
        call("POST", "/messages/batch/archived", { message_ids: ids() });
      },
    };
  }, [items, meta, loaded, lastCall, reload, call]);

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

// The wording of each Notification. Shared so the variants disagree about
// layout, not copy.
export function headline(item: FeedItem): ReactNode {
  const who = <b className="font-semibold">{item.actorName ?? "Someone"}</b>;
  const what = <b className="font-semibold">{item.subject}</b>;
  switch (item.kind) {
    case "discussion-reply":
      return <>{who} replied to your question in {what}</>;
    case "discussion-question":
      return <>{who} asked a question in {what}</>;
    case "refund-approved":
      return <>Your Refund Request for {what} was approved</>;
    case "refund-request-opened":
      return <>{who} asked for a refund on {what} · {item.data.amount}</>;
    case "seat-claimed":
      return <>{who} claimed a Seat in {what} · {item.data.seats_left} Seats left</>;
    case "new-enrollment":
      return <>{who} enrolled in {what}</>;
    default:
      return <>{item.kind}</>;
  }
}

export type KindGroup = "Discussions" | "Refunds" | "Team" | "Enrollments";

export function kindGroup(kind: string): KindGroup {
  if (kind.startsWith("discussion")) return "Discussions";
  if (kind.startsWith("refund")) return "Refunds";
  if (kind === "seat-claimed") return "Team";
  return "Enrollments";
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}
