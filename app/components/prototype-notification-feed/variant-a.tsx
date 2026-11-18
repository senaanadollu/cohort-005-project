// PROTOTYPE — Variant A: "Sidebar popover".
// A "Notifications" item in the sidebar nav with a red count of NEW (unseen)
// Notifications. Clicking it opens a compact panel beside the sidebar.
// Opening the panel clears the count (everything becomes seen); a row stays
// bold with a dot until it is clicked, which marks it read and goes to it.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { headline, timeAgo, useFeed } from "./feed";

export const variantAName = "Sidebar popover";

export function VariantASidebarItem() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) feed.markAllSeen();
    // Only when the panel opens, or when something new lands while it is open.
  }, [open, feed.unseen]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        Notifications
        {feed.unseen > 0 && (
          <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
            {feed.unseen > 9 ? "9+" : feed.unseen}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed left-56 top-14 z-40 ml-2 mt-2 flex max-h-[70vh] w-96 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              <button
                onClick={feed.markAllRead}
                disabled={feed.unread === 0}
                className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                Mark all as read
              </button>
            </div>
            <div className="overflow-y-auto">
              {feed.loaded && feed.items.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No Notifications yet.
                </p>
              )}
              {feed.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    feed.markRead(item.id);
                    setOpen(false);
                    navigate(item.url);
                  }}
                  className="flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent/60"
                >
                  <UserAvatar
                    name={item.actorName ?? "Cadence"}
                    avatarUrl={null}
                    className="mt-0.5 size-7 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm leading-snug",
                        item.read && "text-muted-foreground"
                      )}
                    >
                      {headline(item)}
                    </p>
                    {item.excerpt && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.excerpt}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {timeAgo(item.insertedAt)}
                    </p>
                  </div>
                  {!item.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
