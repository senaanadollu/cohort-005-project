// PROTOTYPE — Variant D: "The pick". The combination chosen after trying
// A, B and C:
//   - a bell next to the Cadence title in the sidebar header (bell from B)
//   - the badge counts Notifications that are NEW since the panel was last
//     opened, and clears on open (A)
//   - it opens a panel beside the sidebar (A)
//   - All / Unread toggle (B) and category chips (C) inside the panel
//   - clicking a row is the only way to mark it read; it closes the panel and
//     goes to the related part of the page (e.g. the comment itself)

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, MessageSquare, Receipt, UserPlus, UsersRound } from "lucide-react";
import { cn } from "~/lib/utils";
import { headline, kindGroup, timeAgo, useFeed, type KindGroup } from "./feed";

export const variantDName = "The pick: header bell + popover";

const icons: Record<KindGroup, React.ReactNode> = {
  Discussions: <MessageSquare className="size-4" />,
  Refunds: <Receipt className="size-4" />,
  Team: <UsersRound className="size-4" />,
  Enrollments: <UserPlus className="size-4" />,
};

export function VariantDHeaderBell() {
  const feed = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [category, setCategory] = useState<KindGroup | "All">("All");

  useEffect(() => {
    if (open) feed.markAllSeen();
  }, [open, feed.unseen]);

  const present = Array.from(new Set(feed.items.map((i) => kindGroup(i.kind))));
  const shown = feed.items.filter(
    (i) =>
      (tab === "all" || !i.read) &&
      (category === "All" || kindGroup(i.kind) === category)
  );

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className={cn(
          "relative rounded-md p-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70"
        )}
      >
        <Bell className="size-5" />
        {feed.unseen > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
            {feed.unseen > 9 ? "9+" : feed.unseen}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed left-56 top-0 z-40 ml-2 mt-2 flex max-h-[80vh] w-[26rem] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center gap-4 border-b px-4 pt-3 text-sm">
              <span className="pb-2 font-semibold">Notifications</span>
              <div className="ml-auto flex gap-4">
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
              </div>
            </div>
            {present.length > 1 && (
              <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
                {(["All", ...present] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setCategory(g)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      category === g
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
            <div className="overflow-y-auto">
              {feed.loaded && shown.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {tab === "unread" ? "You're all caught up." : "No Notifications yet."}
                </p>
              )}
              {shown.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    feed.markRead(item.id);
                    setOpen(false);
                    navigate(item.url);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent/60",
                    !item.read && "bg-primary/5"
                  )}
                >
                  <div className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
                    {icons[kindGroup(item.kind)]}
                  </div>
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
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
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
