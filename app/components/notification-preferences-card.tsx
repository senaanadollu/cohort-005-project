import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { useNotificationFeedSession } from "~/components/notification-feed";
import { cn } from "~/lib/utils";
import {
  loadPreferences,
  resolveToggles,
  savePreference,
  toggleKey,
  type PreferenceRow,
} from "~/lib/notification-preferences";

// The Settings "Notifications" card. The gear in the Notification Feed panel
// and the footer of Notification emails link here
// (NOTIFICATION_PREFERENCES_PATH, ?section=notifications). It reads
// and writes the person's own preferences in Knock from the browser; if Knock
// can't be reached only this card says so.

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; toggles: Record<string, boolean> };

export function NotificationPreferencesCard({
  rows,
  highlighted = false,
}: {
  rows: PreferenceRow[];
  // True when the link that opened Settings points at this card.
  highlighted?: boolean;
}) {
  const session = useNotificationFeedSession();
  const [state, setState] = useState<State>({ status: "loading" });
  // The loader hands over a new array on every revalidation (a profile save);
  // only a change in which rows there are should reload the card.
  const rowsKey = rows.map(toggleKey).join();

  useEffect(() => {
    if (!session) {
      setState({ status: "failed" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void loadPreferences(session).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", toggles: resolveToggles(rows, result.set) }
          : { status: "failed" }
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, rowsKey]);

  async function flip(row: PreferenceRow) {
    if (!session || state.status !== "ready") return;
    const key = toggleKey(row);
    const next = !state.toggles[key];
    const set = (value: boolean) =>
      setState((s) =>
        s.status === "ready"
          ? { status: "ready", toggles: { ...s.toggles, [key]: value } }
          : s
      );
    set(next);
    const saved = await savePreference(session, row.category, row.channel, next);
    if (!saved) {
      set(!next);
      toast.error(`Couldn't save your ${row.label} preference.`);
    }
  }

  return (
    <Card
      id="notifications"
      className="mt-8 max-w-md scroll-mt-6"
      data-highlighted={highlighted || undefined}
    >
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Refunds and Discussions always appear in the Notification Feed.
        </p>
      </CardHeader>
      <CardContent>
        {state.status === "loading" && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
        {state.status === "failed" && (
          <p role="alert" className="text-sm text-muted-foreground">
            Couldn't load your Notification preferences
          </p>
        )}
        {state.status === "ready" && (
          <ul className="space-y-4">
            {rows.map((row) => {
              const key = toggleKey(row);
              const on = state.toggles[key] ?? false;
              const labelId = `notification-${key.replace("/", "-")}`;
              return (
                <li key={key} className="flex items-start justify-between gap-4">
                  <div>
                    <p id={labelId} className="text-sm font-medium">
                      {row.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {row.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.channel === "email" ? "Email" : "Notification Feed"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-labelledby={labelId}
                    onClick={() => void flip(row)}
                    className={cn(
                      "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
                      on ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                        on && "translate-x-5"
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
