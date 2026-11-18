// PROTOTYPE — floating variant switcher for the Notification Feed prototype.
// Deliberately not part of the design being judged. Also shows the live Knock
// feed state and lets you send yourself sample Notifications.

import { useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFeed } from "./feed";

export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];
const STORAGE_KEY = "prototype-notification-feed-variant";

// `?variant=` wins; otherwise the last one picked, so the choice survives
// clicking through to a Notification's target page.
export function useVariant(): [Variant, (v: Variant) => void] {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("variant")?.toUpperCase() as Variant | undefined;
  const [stored, setStored] = useState<Variant>("A");
  useEffect(() => {
    const s = sessionStorage.getItem(STORAGE_KEY) as Variant | null;
    if (s && VARIANTS.includes(s)) setStored(s);
  }, []);
  const variant = fromUrl && VARIANTS.includes(fromUrl) ? fromUrl : stored;
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, variant);
    setStored(variant);
  }, [variant]);
  const set = (v: Variant) =>
    setParams(
      (p) => {
        p.set("variant", v);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  return [variant, set];
}

export function PrototypeSwitcher({
  variant,
  setVariant,
  names,
}: {
  variant: Variant;
  setVariant: (v: Variant) => void;
  names: Record<Variant, string>;
}) {
  const feed = useFeed();
  const fetcher = useFetcher();
  const cycle = (d: number) =>
    setVariant(
      VARIANTS[(VARIANTS.indexOf(variant) + d + VARIANTS.length) % VARIANTS.length]
    );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Pick up freshly sent samples without waiting for the next poll.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const t = setTimeout(feed.reload, 1200);
      return () => clearTimeout(t);
    }
  }, [fetcher.state, fetcher.data]);

  const btn = "rounded-full px-2 py-1 hover:bg-white/15 disabled:opacity-50";
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-fuchsia-700 px-3 py-2 font-mono text-xs text-white shadow-2xl ring-2 ring-white/40">
      <div className="flex items-center justify-center gap-1">
        <button className={btn} onClick={() => cycle(-1)}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-44 text-center font-semibold">
          PROTOTYPE · {variant} ({names[variant]})
        </span>
        <button className={btn} onClick={() => cycle(1)}>
          <ChevronRight className="size-4" />
        </button>
        <span className="mx-1 opacity-40">|</span>
        <fetcher.Form method="post" action="/api/prototype-notifications">
          <button className={btn} disabled={fetcher.state !== "idle"}>
            {fetcher.state === "idle" ? "＋ Send me samples" : "Sending…"}
          </button>
        </fetcher.Form>
        <button className={btn} onClick={feed.archiveAll}>
          Clear feed
        </button>
      </div>
      <div className="mt-1 text-center opacity-80">
        Knock: {feed.total} total · {feed.unseen} unseen · {feed.unread} unread
        {feed.lastCall && <> · {feed.lastCall.replace(/msg_?[A-Za-z0-9]{6,}|[0-9A-Za-z]{20,}/, "…")}</>}
      </div>
    </div>
  );
}
