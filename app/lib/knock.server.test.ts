import { describe, it, expect } from "vitest";
import { senderFromEnv } from "./knock.server";

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
