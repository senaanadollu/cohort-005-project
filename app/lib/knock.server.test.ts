import { describe, it, expect } from "vitest";
import {
  appUrlFromEnv,
  removeNotificationsFor,
  senderFromEnv,
  type KnockMessages,
} from "./knock.server";

const trigger = {
  actor: { id: "2", name: "Ada", email: "ada@example.com" },
  recipients: [{ id: "1", name: "Bo", email: "bo@example.com" }],
  data: { comment_id: 7 },
};

describe("senderFromEnv", () => {
  it("refuses to run in production without KNOCK_API_KEY", () => {
    expect(() => senderFromEnv({ NODE_ENV: "production" })).toThrow(
      /KNOCK_API_KEY/
    );
  });

  it("uses a logging stand-in outside production without KNOCK_API_KEY", async () => {
    const lines: string[] = [];
    const sender = senderFromEnv({ NODE_ENV: "development" }, (line) =>
      lines.push(line)
    );

    const response = await sender.trigger(
      "discussion-reply",
      trigger,
      "discussion-reply:7"
    );

    expect(response.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("discussion-reply");
    expect(lines[0]).toContain('"recipients":[{"id":"1"');
    expect(lines[0]).toContain('"comment_id":7');
  });
});

describe("appUrlFromEnv", () => {
  it("refuses to run in production without APP_URL", () => {
    expect(() => appUrlFromEnv({ NODE_ENV: "production" })).toThrow(/APP_URL/);
  });

  it("uses APP_URL without a trailing slash, so it prefixes a path cleanly", () => {
    expect(
      appUrlFromEnv({
        NODE_ENV: "production",
        APP_URL: "https://cadence.example.com/",
      })
    ).toBe("https://cadence.example.com");
  });

  it("falls back to the local dev server outside production", () => {
    expect(appUrlFromEnv({ NODE_ENV: "development" })).toBe(
      "http://localhost:5173"
    );
  });
});

describe("removeNotificationsFor", () => {
  type Item = { id: string; data: Record<string, unknown> };

  function fakeMessages(pages: Item[][]) {
    const listed: {
      workflowKey: string;
      triggerData: unknown;
      after?: string;
    }[] = [];
    const archived: string[][] = [];
    const messages: KnockMessages = {
      async list(workflowKey, triggerData, after) {
        listed.push({ workflowKey, triggerData, after });
        const index = after ? Number(after) : 0;
        const next = index + 1 < pages.length ? String(index + 1) : undefined;
        return { items: pages[index] ?? [], next };
      },
      async archive(ids) {
        archived.push(ids);
      },
    };
    return { messages, listed, archived };
  }

  it("archives the messages Knock lists for the comment", async () => {
    const { messages, listed, archived } = fakeMessages([
      [{ id: "m1", data: { comment_id: 7 } }],
    ]);

    const count = await removeNotificationsFor(messages, "discussion-reply", 7);

    expect(listed).toEqual([
      {
        workflowKey: "discussion-reply",
        triggerData: { comment_id: 7 },
        after: undefined,
      },
    ]);
    expect(archived).toEqual([["m1"]]);
    expect(count).toBe(1);
  });

  it("archives only messages whose data names the comment, in case Knock matched loosely", async () => {
    const { messages, archived } = fakeMessages([
      [
        { id: "m1", data: { comment_id: 7 } },
        { id: "m2", data: { comment_id: 8 } },
        { id: "m3", data: {} },
      ],
    ]);

    await removeNotificationsFor(messages, "discussion-question", 7);

    expect(archived).toEqual([["m1"]]);
  });

  it("follows the pages", async () => {
    const { messages, archived } = fakeMessages([
      [{ id: "m1", data: { comment_id: 7 } }],
      [{ id: "m2", data: { comment_id: 7 } }],
    ]);

    await removeNotificationsFor(messages, "discussion-reply", 7);

    expect(archived.flat()).toEqual(["m1", "m2"]);
  });

  it("archives nothing when Knock lists nothing", async () => {
    const { messages, archived } = fakeMessages([[]]);

    expect(await removeNotificationsFor(messages, "discussion-reply", 7)).toBe(
      0
    );
    expect(archived).toEqual([]);
  });
});
