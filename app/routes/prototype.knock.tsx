// PROTOTYPE — throwaway Knock spike for the wayfinder ticket
// "Does Knock hold up against Cadence?". Deliberately ugly: it judges vendor
// fit, not how the Notification Feed looks. Run `npm run dev`, open
// /prototype/knock, and switch users in the DevUI panel.

import { useCallback, useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import { ne } from "drizzle-orm";
import type { Route } from "./+types/prototype.knock";
import { db } from "~/db";
import { users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import {
  clearPreferences,
  getPreferences,
  knockUserId,
  setNewEnrollmentInApp,
  signFeedToken,
  triggerTestDiscussionReply,
  triggerTestNewEnrollment,
} from "~/lib/prototype-knock.server";

const KNOCK_API = "https://api.knock.app/v1";

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Select a user from the DevUI panel", { status: 401 });
  }
  const other = db.select().from(users).where(ne(users.id, currentUserId)).get();
  return {
    knockUserId: knockUserId(currentUserId),
    otherKnockUserId: other ? knockUserId(other.id) : null,
    userToken: await signFeedToken(currentUserId),
    publicKey: process.env.KNOCK_PUBLIC_API_KEY!,
    feedChannelId: process.env.KNOCK_FEED_CHANNEL_ID!,
    preferences: await getPreferences(currentUserId),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) throw data("No user", { status: 401 });
  const other = db.select().from(users).where(ne(users.id, currentUserId)).get();
  const intent = (await request.formData()).get("intent");
  try {
    if (intent === "trigger-reply")
      return { intent, result: await triggerTestDiscussionReply(currentUserId, other!.id) };
    if (intent === "trigger-enrollment")
      return { intent, result: await triggerTestNewEnrollment(currentUserId, other!.id) };
    if (intent === "opt-in")
      return { intent, result: await setNewEnrollmentInApp(currentUserId, true) };
    if (intent === "opt-out")
      return { intent, result: await setNewEnrollmentInApp(currentUserId, false) };
    if (intent === "clear-prefs") {
      await clearPreferences(currentUserId);
      return { intent, result: "cleared" };
    }
  } catch (e) {
    return { intent, error: String(e) };
  }
  return { intent, error: "unknown intent" };
}

function decodeJwtPart(part: string) {
  return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded bg-muted p-2 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const btn = "rounded border px-2 py-1 text-xs hover:bg-muted";

export default function KnockSpike({ loaderData }: Route.ComponentProps) {
  const { knockUserId, otherKnockUserId, userToken, publicKey, feedChannelId, preferences } =
    loaderData;
  const fetcher = useFetcher<typeof action>();
  const [feed, setFeed] = useState<any>(null);
  const [feedStatus, setFeedStatus] = useState<string>("…");
  const [tamper, setTamper] = useState<string>("not run");
  const [lastCall, setLastCall] = useState<string>("");

  // Everything below runs in the browser, straight against Knock, with only
  // the public key and the signed user token.
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

  const loadFeed = useCallback(async () => {
    const res = await knockFetch(`/users/${knockUserId}/feeds/${feedChannelId}`);
    setFeedStatus(`${res.status} ${res.statusText}`);
    setFeed(await res.json());
  }, [knockFetch, knockUserId, feedChannelId]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed, fetcher.data]);

  async function tamperTest() {
    const res = await knockFetch(`/users/${otherKnockUserId}/feeds/${feedChannelId}`);
    setTamper(`${res.status} ${JSON.stringify(await res.json())}`);
  }

  async function mark(messageId: string, status: "seen" | "read", undo = false) {
    const res = await knockFetch(`/messages/${messageId}/${status}`, {
      method: undo ? "DELETE" : "PUT",
    });
    setLastCall(`${undo ? "DELETE" : "PUT"} /messages/${messageId}/${status} → ${res.status}`);
    loadFeed();
  }

  async function markAll(status: "seen" | "read") {
    const ids = (feed?.entries ?? []).map((e: any) => e.id);
    const res = await knockFetch(`/messages/batch/${status}`, {
      method: "POST",
      body: JSON.stringify({ message_ids: ids }),
    });
    setLastCall(`POST /messages/batch/${status} (${ids.length}) → ${res.status}`);
    loadFeed();
  }

  const [h, p] = userToken.split(".");

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 text-sm">
      <h1 className="text-xl font-bold">PROTOTYPE · Knock spike</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">1 · Signed user token</h2>
        <p>
          Cadence user → Knock user <b>{knockUserId}</b>. Switch users in the DevUI panel
          and this page re-signs.
        </p>
        <Json value={{ header: decodeJwtPart(h), payload: decodeJwtPart(p) }} />
        <p>Feed read with this token: <b>{feedStatus}</b></p>
        <button className={btn} onClick={tamperTest}>
          Read user {otherKnockUserId}'s feed with my token (should be refused)
        </button>
        <p>Result: {tamper}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">2 · Trigger (Node SDK)</h2>
        <fetcher.Form method="post" className="flex gap-2">
          <button className={btn} name="intent" value="trigger-reply">
            Trigger Discussion Reply → me
          </button>
        </fetcher.Form>
        <p className="text-muted-foreground">
          Real path: reply to another user's Discussion Question on any lesson, then
          switch to the question's author.
        </p>
        <Json value={fetcher.data ?? "no action yet"} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">3 · Headless feed API</h2>
        <div className="flex gap-2">
          <button className={btn} onClick={loadFeed}>Reload</button>
          <button className={btn} onClick={() => markAll("seen")}>Mark all seen</button>
          <button className={btn} onClick={() => markAll("read")}>Mark all read</button>
        </div>
        <p>Last call: {lastCall || "—"}</p>
        <Json value={feed?.meta ?? null} />
        <ul className="space-y-2">
          {(feed?.entries ?? []).map((e: any) => (
            <li key={e.id} className="rounded border p-2">
              <div
                dangerouslySetInnerHTML={{
                  __html: e.blocks?.find((b: any) => b.name === "body")?.rendered ?? "",
                }}
              />
              <div className="text-xs text-muted-foreground">
                {e.source?.key} · {e.inserted_at} · seen_at {String(e.seen_at)} · read_at{" "}
                {String(e.read_at)}
              </div>
              <div className="mt-1 flex gap-2">
                <button className={btn} onClick={() => mark(e.id, "seen")}>seen</button>
                <button className={btn} onClick={() => mark(e.id, "read")}>read</button>
                <button className={btn} onClick={() => mark(e.id, "read", true)}>unread</button>
              </div>
            </li>
          ))}
        </ul>
        <details>
          <summary>Raw feed response</summary>
          <Json value={feed} />
        </details>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">4 · Preferences (new Enrollment, off by default)</h2>
        <fetcher.Form method="post" className="flex flex-wrap gap-2">
          <button className={btn} name="intent" value="trigger-enrollment">
            Trigger new Enrollment → me
          </button>
          <button className={btn} name="intent" value="opt-in">Opt in (in-app)</button>
          <button className={btn} name="intent" value="opt-out">Opt out (in-app)</button>
          <button className={btn} name="intent" value="clear-prefs">
            Clear my preferences (back to default)
          </button>
        </fetcher.Form>
        <p>My preference set as Knock resolves it:</p>
        <Json value={preferences} />
      </section>
    </div>
  );
}
