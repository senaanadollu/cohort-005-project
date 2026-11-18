import { describe, expect, it } from "vitest";
import { parseFeedResponse } from "./knock-feed";

// Shape of GET /v1/users/{id}/feeds/{channel}, trimmed to what Cadence reads.
const reply = {
  id: "msg_1",
  inserted_at: "2026-11-18T11:58:00.000Z",
  seen_at: null,
  read_at: null,
  archived_at: null,
  actors: [{ id: "3", name: "Bo", email: "bo@example.com" }],
  source: { key: "discussion-reply", categories: ["discussions"] },
  data: {
    lesson_title: "Generics",
    target_path: "/courses/ts/lessons/4?comment=9",
  },
  blocks: [],
};

describe("parseFeedResponse", () => {
  it("reads each Notification's workflow key, actor, data and seen/read state, and the unseen and unread counts", () => {
    const feed = parseFeedResponse({
      entries: [
        reply,
        {
          ...reply,
          id: "msg_2",
          seen_at: "2026-11-18T11:59:00.000Z",
          read_at: "2026-11-18T11:59:30.000Z",
        },
      ],
      meta: { total_count: 2, unread_count: 1, unseen_count: 1 },
      page_info: { after: null, before: null, page_size: 50 },
    });

    expect(feed).toEqual({
      unseenCount: 1,
      unreadCount: 1,
      items: [
        {
          id: "msg_1",
          workflowKey: "discussion-reply",
          insertedAt: "2026-11-18T11:58:00.000Z",
          seen: false,
          read: false,
          actorName: "Bo",
          data: reply.data,
        },
        {
          id: "msg_2",
          workflowKey: "discussion-reply",
          insertedAt: "2026-11-18T11:58:00.000Z",
          seen: true,
          read: true,
          actorName: "Bo",
          data: reply.data,
        },
      ],
    });
  });

  it("tolerates a Notification with no actor or data", () => {
    const feed = parseFeedResponse({
      entries: [{ ...reply, actors: [], data: null }],
      meta: { unread_count: 1, unseen_count: 1 },
    });

    expect(feed?.items[0]).toMatchObject({ actorName: null, data: {} });
  });

  it("drops an entry it can't read instead of failing the whole feed", () => {
    const feed = parseFeedResponse({
      entries: [{ id: "msg_bad" }, reply],
      meta: { unread_count: 2, unseen_count: 2 },
    });

    expect(feed?.items.map((item) => item.id)).toEqual(["msg_1"]);
  });

  it("returns null for a response that isn't a feed", () => {
    expect(parseFeedResponse({ message: "unauthorized" })).toBeNull();
  });
});
