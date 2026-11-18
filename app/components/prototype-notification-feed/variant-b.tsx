// PROTOTYPE — Variant B: "Bell + drawer".
// A bell pinned to the top-right corner of every page, with a count of UNREAD
// Notifications that only drops as each one is read. It opens a full-height
// drawer with All / Unread tabs, grouped by Today / Earlier. Opening the
// drawer changes nothing visible. Each row has its own read/unread toggle.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Circle, CircleCheck, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { headline, isToday, timeAgo, useFeed, type FeedItem } from "./feed";

export const variantBName = "Bell + drawer";

export function VariantBBell() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (open) feed.markAllSeen();
  }, [open, feed.unseen]);

  const shown = tab === "all" ? feed.items : feed.items.filter((i) => !i.read);
  const groups: [string, FeedItem[]][] = [
    ["Today", shown.filter((i) => isToday(i.insertedAt))],
    ["Earlier", shown.filter((i) => !isToday(i.insertedAt))],
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Notifications"
        className="fixed right-5 top-3 z-30 rounded-full border bg-background p-2 shadow-sm hover:bg-accent"
      >
        <Bell className="size-5" />
        {feed.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-5 text-white">
            {feed.unread > 99 ? "99+" : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-[26rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-4 border-b px-5 pt-3 text-sm">
              {(["all", "unread"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "-mb-px border-b-2 pb-2 capitalize",
                    tab === t
                      ? "border-primary font-medium"
                      : "border-transparent text-muted-foreground"
                  )}
                >
                  {t}
                  {t === "unread" && feed.unread > 0 && ` (${feed.unread})`}
                </button>
              ))}
              <button
                onClick={feed.markAllRead}
                disabled={feed.unread === 0}
                className="ml-auto pb-2 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                Mark all as read
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {feed.loaded && shown.length === 0 && (
                <p className="px-5 py-16 text-center text-sm text-muted-foreground">
                  {tab === "unread" ? "You're all caught up." : "No Notifications yet."}
                </p>
              )}
              {groups.map(
                ([label, items]) =>
                  items.length > 0 && (
                    <section key={label}>
                      <h3 className="bg-muted/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </h3>
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "group flex items-start gap-2 border-b px-5 py-3",
                            !item.read && "bg-primary/5"
                          )}
                        >
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              feed.markRead(item.id);
                              setOpen(false);
                              navigate(item.url);
                            }}
                          >
                            <p className="text-sm leading-snug">{headline(item)}</p>
                            {item.excerpt && (
                              <blockquote className="mt-1.5 line-clamp-2 border-l-2 pl-2 text-sm text-muted-foreground">
                                {item.excerpt}
                              </blockquote>
                            )}
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              {timeAgo(item.insertedAt)}
                            </p>
                          </button>
                          <button
                            title={item.read ? "Mark as unread" : "Mark as read"}
                            onClick={() =>
                              item.read ? feed.markUnread(item.id) : feed.markRead(item.id)
                            }
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            {item.read ? (
                              <CircleCheck className="size-4 opacity-0 group-hover:opacity-100" />
                            ) : (
                              <Circle className="size-4 fill-primary text-primary" />
                            )}
                          </button>
                        </div>
                      ))}
                    </section>
                  )
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
