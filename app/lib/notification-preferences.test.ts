import { afterEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "~/db/schema";
import type { NotificationFeedSession } from "./knock-feed";
import {
  loadPreferences,
  preferenceRowsFor,
  resolveToggles,
  savePreference,
} from "./notification-preferences";

const session: NotificationFeedSession = {
  knockUserId: "7",
  userToken: "jwt",
  publicKey: "pk_test",
  feedChannelId: "feed",
};

function summary(role: UserRole, isTeamAdmin = false) {
  return preferenceRowsFor({ role, isTeamAdmin }).map(
    (r) => `${r.category}/${r.channel}: ${r.description}`
  );
}

describe("preferenceRowsFor", () => {
  it("a Student sees Refunds and Discussions email toggles", () => {
    expect(summary(UserRole.Student)).toEqual([
      "refunds/email: When your Refund Request is approved or declined",
      "discussions/email: Replies to your questions",
    ]);
  });

  it("a Team Admin also sees the Team feed toggle", () => {
    expect(summary(UserRole.Student, true)).toEqual([
      "refunds/email: When your Refund Request is approved or declined",
      "discussions/email: Replies to your questions",
      "team/in_app_feed: When someone claims a Seat",
    ]);
  });

  it("an Instructor sees Discussions email and the Enrollments feed toggle", () => {
    expect(summary(UserRole.Instructor)).toEqual([
      "discussions/email: Questions on your courses, and replies to your questions",
      "enrollments/in_app_feed: When a Student enrols in your course",
    ]);
  });

  it("a Platform Admin sees Refunds about opened requests and Discussions replies", () => {
    expect(summary(UserRole.Admin)).toEqual([
      "refunds/email: When someone opens a Refund Request",
      "discussions/email: Replies to your questions",
    ]);
  });
});

describe("resolveToggles", () => {
  const rows = preferenceRowsFor({ role: UserRole.Instructor, isTeamAdmin: false });

  it("with no preference set, everything is on except Enrollments", () => {
    expect(resolveToggles(rows, null)).toEqual({
      "discussions/email": true,
      "enrollments/in_app_feed": false,
    });
  });

  it("Knock's per-channel values win over the defaults", () => {
    const set = {
      categories: {
        discussions: { channel_types: { email: false } },
        enrollments: { channel_types: { in_app_feed: true } },
      },
    };
    expect(resolveToggles(rows, set)).toEqual({
      "discussions/email": false,
      "enrollments/in_app_feed": true,
    });
  });

  it("a partial set leaves the other toggles at their defaults", () => {
    const set = { categories: { discussions: { channel_types: { in_app_feed: false } } } };
    expect(resolveToggles(rows, set)).toEqual({
      "discussions/email": true,
      "enrollments/in_app_feed": false,
    });
  });

  it("a bare boolean on a category applies to its channels", () => {
    const set = { categories: { discussions: false, enrollments: true } };
    expect(resolveToggles(rows, set)).toEqual({
      "discussions/email": false,
      "enrollments/in_app_feed": true,
    });
  });
});

describe("Knock calls", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("loads the person's default preference set", async () => {
    const fetchMock = stubFetch(
      Response.json({ id: "default", categories: { refunds: { channel_types: { email: false } } } })
    );
    const result = await loadPreferences(session);
    expect(result).toEqual({
      ok: true,
      set: { categories: { refunds: { channel_types: { email: false } } } },
    });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.knock.app/v1/users/7/preferences/default");
  });

  it("a set with null categories counts as no preferences", async () => {
    stubFetch(Response.json({ id: "default", categories: null }));
    expect(await loadPreferences(session)).toEqual({
      ok: true,
      set: { categories: undefined },
    });
  });

  it("a 404 means no preference set yet", async () => {
    stubFetch(new Response("{}", { status: 404 }));
    expect(await loadPreferences(session)).toEqual({ ok: true, set: null });
  });

  it("a server error, a refused token, a network failure or a malformed body is a failure", async () => {
    stubFetch(new Response("{}", { status: 500 }));
    expect(await loadPreferences(session)).toEqual({ ok: false });
    stubFetch(new Response("{}", { status: 401 }));
    expect(await loadPreferences(session)).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await loadPreferences(session)).toEqual({ ok: false });
    stubFetch(Response.json(["nope"]));
    expect(await loadPreferences(session)).toEqual({ ok: false });
  });

  it("saves one toggle as a merge of one channel on one category", async () => {
    const fetchMock = stubFetch(Response.json({}));
    const ok = await savePreference(session, "refunds", "email", false);
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.knock.app/v1/users/7/preferences/default");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      __persistence_strategy__: "merge",
      categories: { refunds: { channel_types: { email: false } } },
    });
  });

  it("a failed save reports false", async () => {
    stubFetch(new Response("{}", { status: 403 }));
    expect(await savePreference(session, "team", "in_app_feed", true)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await savePreference(session, "team", "in_app_feed", true)).toBe(false);
  });
});
