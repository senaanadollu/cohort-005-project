import { describe, it, expect } from "vitest";
import { NotificationType } from "../../app/db/schema";
import { WORKFLOWS } from "./definitions";

describe("the workflow definitions", () => {
  it("define a workflow for every NotificationType, once each", () => {
    expect(WORKFLOWS.map((workflow) => workflow.key).sort()).toEqual(
      Object.values(NotificationType).sort()
    );
  });

  it("put both Discussion Notifications in the discussions category", () => {
    const discussion = WORKFLOWS.filter((workflow) =>
      [
        NotificationType.DiscussionQuestion,
        NotificationType.DiscussionReply,
      ].includes(workflow.key)
    );
    expect(discussion).toHaveLength(2);
    expect(discussion.every((w) => w.category === "discussions")).toBe(true);
  });
});
