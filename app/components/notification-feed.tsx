import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import {
  Bell,
  MessageSquare,
  Receipt,
  Settings,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { cn, formatRelativeTime } from "~/lib/utils";
import {
  knockFetch,
  parseFeedResponse,
  type FeedItem,
  type NotificationFeedSession,
} from "~/lib/knock-feed";
import {
  describeNotification,
  feedCategories,
  type NotificationCategory,
  type NotificationRow,
} from "~/lib/notification-rows";

// ─── The Notification Feed ───
// A bell beside the "Cadence" title opens a panel beside the sidebar. The
// feed is read straight from Knock's headless feed API with the user token
// the app layout signed for whoever is in the session.

const POLL_MS = 5000;
const PAGE_SIZE = 50;

// ─── The session, for anything under the app layout ───
// The Settings Notifications card reads the same signed token from here.

const SessionContext = createContext<NotificationFeedSession | null>(null);

export function NotificationFeedSessionProvider({
  session,
  children,
}: {
  session: NotificationFeedSession | null;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

// Null when Knock has no keys here, or nobody is signed in.
export function useNotificationFeedSession(): NotificationFeedSession | null {
  return useContext(SessionContext);
}

// ─── Reading and marking ───

type FeedState = {
  items: FeedItem[];
  unseenCount: number;
  unreadCount: number;
  loaded: boolean;
};

const emptyFeed: FeedState = {
  items: [],
  unseenCount: 0,
  unreadCount: 0,
  loaded: false,
};

function useFeed(session: NotificationFeedSession | null) {
  const [feed, setFeed] = useState<FeedState>(emptyFeed);
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  const renewing = useRef(false);

  const reload = useCallback(async () => {
    if (!session) return;
    try {
      const response = await knockFetch(
        session,
        `/users/${encodeURIComponent(session.knockUserId)}/feeds/` +
          `${encodeURIComponent(session.feedChannelId)}?page_size=${PAGE_SIZE}`
      );
      // The token has expired (an idle tab): reloading the layout signs a
      // fresh one. Only once, so a refused token doesn't loop.
      if (response.status === 401 || response.status === 403) {
        if (!renewing.current) {
          renewing.current = true;
          void revalidate.current();
        }
        return;
      }
      if (!response.ok) return;
      const parsed = parseFeedResponse(await response.json());
      if (!parsed) return;
      setFeed({ ...parsed, loaded: true });
    } catch (error) {
      // Knock unreachable: keep what is shown and try again on the next poll.
      console.warn(
        "[notifications] couldn't read the Notification Feed",
        error
      );
    }
  }, [session]);

  // No real-time connection: poll. A new session (each layout load signs a
  // fresh token) restarts the poll and allows another renewal.
  useEffect(() => {
    renewing.current = false;
    if (!session) {
      setFeed({ ...emptyFeed, loaded: true });
      return;
    }
    void reload();
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [session, reload]);

  const send = useCallback(
    (method: string, path: string, body?: unknown) => {
      if (!session) return;
      knockFetch(session, path, { method, body })
        .catch((error: unknown) =>
          console.warn("[notifications] Knock call failed", error)
        )
        .finally(() => void reload());
    },
    [session, reload]
  );

  // Opening the panel marks what is in it seen, which clears the badge.
  const markAllSeen = useCallback(() => {
    const unseen = feed.items.filter((item) => !item.seen).map((i) => i.id);
    if (unseen.length === 0 && feed.unseenCount === 0) return;
    setFeed((f) => ({
      ...f,
      unseenCount: 0,
      items: f.items.map((item) => ({ ...item, seen: true })),
    }));
    if (unseen.length > 0) {
      send("POST", "/messages/batch/seen", { message_ids: unseen });
    }
  }, [feed.items, feed.unseenCount, send]);

  const markRead = useCallback(
    (item: FeedItem) => {
      if (item.read) return;
      setFeed((f) => ({
        ...f,
        unreadCount: Math.max(0, f.unreadCount - 1),
        items: f.items.map((i) =>
          i.id === item.id ? { ...i, read: true, seen: true } : i
        ),
      }));
      send("PUT", `/messages/${encodeURIComponent(item.id)}/read`);
    },
    [send]
  );

  return { ...feed, markAllSeen, markRead };
}

// ─── The bell and its panel ───

const categoryIcons: Record<NotificationCategory, ReactNode> = {
  Discussions: <MessageSquare className="size-4" />,
  Refunds: <Receipt className="size-4" />,
  Team: <UsersRound className="size-4" />,
  Enrollments: <UserPlus className="size-4" />,
};

type Row = { item: FeedItem; row: NotificationRow };

export function NotificationBell({
  session,
}: {
  session: NotificationFeedSession | null;
}) {
  const feed = useFeed(session);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<NotificationCategory | "All">("All");

  const { markAllSeen } = feed;
  useEffect(() => {
    if (open) markAllSeen();
  }, [open, feed.unseenCount, markAllSeen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const rows: Row[] = feed.items.flatMap((item) => {
    const row = describeNotification(item);
    return row ? [{ item, row }] : [];
  });
  const categories = feedCategories(feed.items);
  const showChips = categories.length > 1;
  const activeCategory = showChips ? category : "All";
  const shown = rows.filter(
    ({ item, row }) =>
      (tab === "all" || !item.read) &&
      (activeCategory === "All" || row.category === activeCategory)
  );

  function openRow({ item, row }: Row) {
    feed.markRead(item);
    setOpen(false);
    if (row.targetPath) navigate(row.targetPath);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={
          feed.unseenCount > 0
            ? `Notifications, ${feed.unseenCount} new`
            : "Notifications"
        }
        aria-expanded={open}
        className={cn(
          "relative rounded-md p-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70"
        )}
      >
        <Bell className="size-5" />
        {feed.unseenCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {feed.unseenCount > 9 ? "9+" : feed.unseenCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed left-56 top-0 z-40 ml-2 mt-2 flex max-h-[80vh] w-[26rem] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
          >
            <div className="flex items-center gap-4 border-b px-4 pt-3 text-sm">
              <span className="pb-2 font-semibold">Notifications</span>
              <div className="ml-auto flex items-center gap-4">
                {(["all", "unread"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "-mb-px border-b-2 pb-2 capitalize",
                      tab === t
                        ? "border-primary font-medium"
                        : "border-transparent text-muted-foreground"
                    )}
                  >
                    {t}
                    {t === "unread" &&
                      feed.unreadCount > 0 &&
                      ` (${feed.unreadCount})`}
                  </button>
                ))}
                <Link
                  to="/settings#notifications"
                  onClick={() => setOpen(false)}
                  title="Notification preferences"
                  aria-label="Notification preferences"
                  className="mb-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Settings className="size-4" />
                </Link>
              </div>
            </div>
            {showChips && (
              <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
                {(["All", ...categories] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      activeCategory === c
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="overflow-y-auto">
              {feed.loaded && shown.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {tab === "unread"
                    ? "You're all caught up."
                    : "No Notifications yet."}
                </p>
              )}
              {shown.map((entry) => (
                <NotificationRowButton
                  key={entry.item.id}
                  entry={entry}
                  onOpen={() => openRow(entry)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function NotificationRowButton({
  entry: { item, row },
  onOpen,
}: {
  entry: Row;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent/60",
        !item.read && "bg-primary/5"
      )}
    >
      <div className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
        {categoryIcons[row.category]}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            item.read && "text-muted-foreground"
          )}
        >
          {row.headline.map((part, i) =>
            part.strong ? (
              <b key={i} className="font-semibold">
                {part.text}
              </b>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </p>
        {row.snippet && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {row.snippet}
          </p>
        )}
        <p
          className="mt-1 text-xs text-muted-foreground"
          suppressHydrationWarning
        >
          {formatRelativeTime(item.insertedAt)}
        </p>
      </div>
      {!item.read && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
        />
      )}
    </button>
  );
}
