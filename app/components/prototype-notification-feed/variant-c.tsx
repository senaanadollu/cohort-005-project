// PROTOTYPE — Variant C: "Full page".
// No overlay at all. A "Notifications" link in the sidebar nav with a quiet
// unread count leads to a dedicated /notifications page: roomy rows with an
// icon per kind, filter chips by kind, and explicit "Open" / "Mark as read"
// actions. Visiting the page marks everything seen; nothing is marked read
// unless you open it or say so.

import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";
import { Bell, MessageSquare, Receipt, UserPlus, UsersRound } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { headline, kindGroup, timeAgo, useFeed, type KindGroup } from "./feed";

export const variantCName = "Full page";

export function VariantCSidebarItem() {
  const feed = useFeed();
  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {feed.unread > 0 && (
        <span className="ml-auto rounded-md bg-sidebar-accent px-1.5 py-0.5 text-xs tabular-nums">
          {feed.unread}
        </span>
      )}
    </NavLink>
  );
}

const icons: Record<KindGroup, React.ReactNode> = {
  Discussions: <MessageSquare className="size-4" />,
  Refunds: <Receipt className="size-4" />,
  Team: <UsersRound className="size-4" />,
  Enrollments: <UserPlus className="size-4" />,
};

export function VariantCPage() {
  const feed = useFeed();
  const [filter, setFilter] = useState<KindGroup | "All">("All");
  const [unreadOnly, setUnreadOnly] = useState(false);

  useEffect(() => {
    feed.markAllSeen();
  }, [feed.unseen]);

  const present = Array.from(new Set(feed.items.map((i) => kindGroup(i.kind))));
  const shown = feed.items.filter(
    (i) =>
      (filter === "All" || kindGroup(i.kind) === filter) && (!unreadOnly || !i.read)
  );

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {feed.unread > 0 ? `${feed.unread} unread` : "You're all caught up"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={feed.markAllRead}
          disabled={feed.unread === 0}
        >
          Mark all as read
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["All", ...present] as const).map((g) => (
          <button
            key={g}
            onClick={() => setFilter(g)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filter === g
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {g}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          Unread only
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        {feed.loaded && shown.length === 0 && (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">
            Nothing here.
          </p>
        )}
        {shown.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-4 border-b border-l-4 px-4 py-4 last:border-b-0",
              item.read ? "border-l-transparent" : "border-l-primary bg-primary/5"
            )}
          >
            <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
              {icons[kindGroup(item.kind)]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {kindGroup(item.kind)} · {timeAgo(item.insertedAt)}
              </p>
              <p className={cn("mt-1 text-sm", item.read && "text-muted-foreground")}>
                {headline(item)}
              </p>
              {item.excerpt && (
                <p className="mt-1 text-sm text-muted-foreground">“{item.excerpt}”</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Button asChild size="xs" variant="outline">
                <Link to={item.url} onClick={() => feed.markRead(item.id)}>
                  Open
                </Link>
              </Button>
              <button
                onClick={() =>
                  item.read ? feed.markUnread(item.id) : feed.markRead(item.id)
                }
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {item.read ? "Mark as unread" : "Mark as read"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
