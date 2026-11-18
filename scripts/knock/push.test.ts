import { describe, expect, it } from "vitest";
import { NotificationType } from "../../app/db/schema";
import type { WorkflowDefinition } from "./definitions";
import { pushToKnock, type ManagementApi } from "./push";

type Call = { method: string; path: string; body?: unknown };

const FEED_CHANNEL_ID = "11111111-2222-3333-4444-555555555555";

// A stand-in for Knock's Management API holding what the prototypes left:
// a discussion-reply workflow with no category, a new-enrollment workflow,
// and the discussions and new-enrollment preference categories.
function fakeKnock() {
  const calls: Call[] = [];
  const api: ManagementApi = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === "GET" && path.startsWith("/channels")) {
      return {
        entries: [
          { id: FEED_CHANNEL_ID, key: "in-app-feed", type: "in_app_feed" },
        ],
        page_info: { after: null },
      };
    }
    if (method === "GET" && path.startsWith("/workflows")) {
      return path.includes("after=page2")
        ? { entries: [{ key: "new-enrollment" }], page_info: { after: null } }
        : {
            entries: [{ key: "discussion-reply" }],
            page_info: { after: "page2" },
          };
    }
    if (method === "GET" && path.startsWith("/preference_categories")) {
      return { entries: [{ name: "discussions" }, { name: "new-enrollment" }] };
    }
    return {};
  };
  return { api, calls };
}

const workflows: WorkflowDefinition[] = [
  {
    key: NotificationType.DiscussionReply,
    name: "Discussion Reply",
    category: "discussions",
    feed: { markdownBody: "**{{ actor.name }}** replied" },
  },
];

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET");
}

describe("pushToKnock", () => {
  it("creates the four preference categories before any workflow", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(
      api,
      { feedChannelId: FEED_CHANNEL_ID, workflows },
      () => {}
    );

    const firstWrites = writes(calls).slice(0, 4);
    expect(firstWrites.map((call) => `${call.method} ${call.path}`)).toEqual([
      "PUT /preference_categories/discussions",
      "PUT /preference_categories/refunds",
      "PUT /preference_categories/team",
      "PUT /preference_categories/enrollments",
    ]);
  });

  it("upserts, commits and activates each workflow with its feed step and category", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(
      api,
      { feedChannelId: FEED_CHANNEL_ID, workflows },
      () => {}
    );

    const upsert = calls.find(
      (call) =>
        call.method === "PUT" &&
        call.path.startsWith("/workflows/discussion-reply?")
    );
    expect(upsert?.path).toContain("environment=development");
    expect(upsert?.path).toContain("commit=true");
    expect(upsert?.body).toEqual({
      workflow: {
        name: "Discussion Reply",
        categories: ["discussions"],
        steps: [
          {
            ref: "in_app_feed",
            type: "channel",
            channel_key: "in-app-feed",
            template: {
              markdown_body: "**{{ actor.name }}** replied",
              action_url: "{{ data.target_path }}",
            },
          },
        ],
      },
    });
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/workflows/discussion-reply/activate?environment=development",
      body: { status: true },
    });
  });

  it("archives workflows and categories that are not defined in the repo", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(
      api,
      { feedChannelId: FEED_CHANNEL_ID, workflows },
      () => {}
    );

    const removals = calls
      .filter((call) => call.method === "DELETE")
      .map((call) => call.path);
    expect(removals).toEqual([
      "/workflows/new-enrollment?environment=development",
      "/preference_categories/new-enrollment",
    ]);
  });

  it("replaces the environment default preference set with the single false, before archiving old categories", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(
      api,
      { feedChannelId: FEED_CHANNEL_ID, workflows },
      () => {}
    );

    const defaults = calls.filter((call) =>
      call.path.startsWith("/environments/")
    );
    expect(defaults).toEqual([
      {
        method: "PUT",
        path: "/environments/development/defaults",
        body: {
          preference_set: {
            categories: {
              enrollments: { channel_types: { in_app_feed: false } },
            },
          },
        },
      },
    ]);
    expect(calls.indexOf(defaults[0])).toBeLessThan(
      calls.findIndex((call) => call.method === "DELETE")
    );
  });

  it("stops before writing anything when the feed channel is not found", async () => {
    const { api, calls } = fakeKnock();

    await expect(
      pushToKnock(api, { feedChannelId: "not-a-channel", workflows }, () => {})
    ).rejects.toThrow(/KNOCK_FEED_CHANNEL_ID/);
    expect(writes(calls)).toEqual([]);
  });
});
