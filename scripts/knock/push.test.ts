import { describe, expect, it } from "vitest";
import { NotificationType } from "../../app/db/schema";
import {
  EMAIL_LAYOUT,
  EMAIL_PRE_CONTENT,
  emailSenderFrom,
  type WorkflowDefinition,
} from "./definitions";
import { pushToKnock, type ManagementApi } from "./push";

type Call = { method: string; path: string; body?: unknown };

const FEED_CHANNEL_ID = "11111111-2222-3333-4444-555555555555";
const EMAIL_CHANNEL_ID = "66666666-7777-8888-9999-000000000000";

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
          { id: EMAIL_CHANNEL_ID, key: "postmark", type: "email" },
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

const emailed: WorkflowDefinition = {
  key: NotificationType.RefundRequestApproved,
  name: "Refund Request approved",
  category: "refunds",
  feed: { markdownBody: "Approved" },
  email: {
    subject: "Refund approved — {{ data.course_title }}",
    button: "View your refund request",
    htmlBody: "<p>Approved</p>",
    textBody: "Approved",
  },
};

const channels = {
  feedChannelId: FEED_CHANNEL_ID,
  emailChannelId: EMAIL_CHANNEL_ID,
};

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET");
}

describe("pushToKnock", () => {
  it("creates the four preference categories before any workflow", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(api, { ...channels, workflows }, () => {});

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

    await pushToKnock(api, { ...channels, workflows }, () => {});

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

    await pushToKnock(api, { ...channels, workflows }, () => {});

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

    await pushToKnock(api, { ...channels, workflows }, () => {});

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
      pushToKnock(
        api,
        { ...channels, feedChannelId: "not-a-channel", workflows },
        () => {}
      )
    ).rejects.toThrow(/KNOCK_FEED_CHANNEL_ID/);
    expect(writes(calls)).toEqual([]);
  });

  it("stops before writing anything when the email channel is not found", async () => {
    const { api, calls } = fakeKnock();

    await expect(
      pushToKnock(
        api,
        { ...channels, emailChannelId: "not-a-channel", workflows },
        () => {}
      )
    ).rejects.toThrow(/KNOCK_EMAIL_CHANNEL_ID/);
    expect(writes(calls)).toEqual([]);
  });

  it("upserts and commits the shared email layout before any workflow", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(api, { ...channels, workflows: [emailed] }, () => {});

    const layout = calls.findIndex(
      (call) => call.method === "PUT" && call.path.startsWith("/email_layouts/")
    );
    const firstWorkflow = calls.findIndex(
      (call) => call.method === "PUT" && call.path.startsWith("/workflows/")
    );
    expect(layout).toBeGreaterThan(-1);
    expect(layout).toBeLessThan(firstWorkflow);
    const { path, body } = calls[layout];
    expect(path).toMatch(/^\/email_layouts\/cadence\?/);
    expect(path).toContain("environment=development");
    expect(path).toContain("commit=true");
    expect(body).toEqual({
      email_layout: {
        name: "Cadence",
        html_layout: EMAIL_LAYOUT.html,
        text_layout: EMAIL_LAYOUT.text,
      },
    });
  });

  it("gives an emailed workflow an email step on the Postmark channel, wrapped in the layout", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(api, { ...channels, workflows: [emailed] }, () => {});

    const upsert = calls.find(
      (call) =>
        call.method === "PUT" &&
        call.path.startsWith("/workflows/refund-request-approved?")
    );
    const steps = (upsert?.body as { workflow: { steps: unknown[] } }).workflow
      .steps;
    expect(steps).toHaveLength(2);
    expect(steps[1]).toEqual({
      ref: "email",
      type: "channel",
      channel_type: "email",
      channel_key: "postmark",
      channel_overrides: {
        from_name: "Cadence",
        from_address: "notifications@anadollu.com",
        open_tracking: false,
        link_tracking: false,
      },
      template: {
        subject: "Refund approved — {{ data.course_title }}",
        html_body: "<p>Approved</p>",
        text_body: "Approved",
        settings: {
          layout_key: "cadence",
          pre_content:
            EMAIL_PRE_CONTENT +
            '{% assign button_label = "View your refund request" %}' +
            '{% assign category_name = "Refunds" %}',
        },
      },
    });
  });

  it("sends the email step from the configured sender", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(
      api,
      {
        ...channels,
        workflows: [emailed],
        sender: emailSenderFrom("Cadence Staging <notify@staging.example.com>"),
      },
      () => {}
    );

    const upsert = calls.find(
      (call) =>
        call.method === "PUT" &&
        call.path.startsWith("/workflows/refund-request-approved?")
    );
    const steps = (
      upsert?.body as {
        workflow: { steps: { channel_overrides?: Record<string, unknown> }[] };
      }
    ).workflow.steps;
    expect(steps[1].channel_overrides).toMatchObject({
      from_name: "Cadence Staging",
      from_address: "notify@staging.example.com",
    });
  });

  it("gives a workflow without an email no email step", async () => {
    const { api, calls } = fakeKnock();

    await pushToKnock(api, { ...channels, workflows }, () => {});

    const upsert = calls.find(
      (call) =>
        call.method === "PUT" &&
        call.path.startsWith("/workflows/discussion-reply?")
    );
    const steps = (upsert?.body as { workflow: { steps: unknown[] } }).workflow
      .steps;
    expect(steps).toHaveLength(1);
  });
});
