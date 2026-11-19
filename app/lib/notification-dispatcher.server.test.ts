import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  discussionFixture,
  fakeSender,
  scriptedSender,
} from "~/test/notification-dispatcher-fixtures";
import {
  dispatchPendingNotifications,
  startNotificationDispatcher,
} from "./notification-dispatcher.server";
import { senderFromEnv } from "./knock.server";

// Who each Discussion Notification goes to and what it carries. Retries, the
// sweep and app_url are in notification-dispatcher.retries.server.test.ts.

let fixture: ReturnType<typeof discussionFixture>;
let db: typeof fixture.db;
let base: typeof fixture.base;
let lessonId: number;

const lines: string[] = [];
const log = (line: string) => lines.push(line);
const rows = () => fixture.rows();
const post = (userId: number, parentId: number | null, body: string) =>
  fixture.post(userId, parentId, body);
const askQuestion = (userId: number, body: string) =>
  fixture.askQuestion(userId, body);
const replyPending = () => fixture.replyPending();

beforeEach(() => {
  lines.length = 0;
  fixture = discussionFixture();
  ({ db, base, lessonId } = fixture);
});

describe("dispatching a Discussion Reply", () => {
  it("triggers discussion-reply for the question's author, with the replier as actor", async () => {
    const question = askQuestion(base.user.id, "How do generics work?");
    const reply = post(base.instructor.id, question.id, "Like this.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([
      {
        workflowKey: "discussion-reply",
        idempotencyKey: `discussion-reply:${reply.id}`,
        trigger: {
          actor: {
            id: String(base.instructor.id),
            name: "Test Instructor",
            email: "instructor@example.com",
          },
          recipients: [
            {
              id: String(base.user.id),
              name: "Test User",
              email: "test@example.com",
            },
          ],
          data: {
            lesson_id: lessonId,
            lesson_title: "Generics",
            course_id: base.course.id,
            course_title: "Test Course",
            comment_id: reply.id,
            snippet: "Like this.",
            target_path: `/courses/test-course/lessons/${lessonId}?comment=${reply.id}`,
          },
        },
      },
    ]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("identifies people with their avatar when they have one", async () => {
    db.update(schema.users)
      .set({ avatarUrl: "https://example.com/u.png" })
      .where(eq(schema.users.id, base.user.id))
      .run();
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent[0].trigger.recipients[0].avatar).toBe(
      "https://example.com/u.png"
    );
    expect(sent[0].trigger.actor).not.toHaveProperty("avatar");
  });

  it("reads the current names when it sends, not those at the time of the reply", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "Like this.");
    db.update(schema.users)
      .set({ name: "Renamed Instructor" })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent[0].trigger.actor.name).toBe("Renamed Instructor");
  });

  it("cuts a long reply down to a snippet", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "a".repeat(600));
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent[0].trigger.data.snippet).toBe(`${"a".repeat(500)}…`);
  });

  it("drops the actor, so a reply by the question's own author closes the row without a trigger", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.user.id, question.id, "Never mind, solved it.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("closes the row without a trigger when the reply has since been deleted", async () => {
    const question = askQuestion(base.user.id, "How?");
    const reply = post(base.instructor.id, question.id, "Like this.");
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, reply.id))
      .run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("closes the row without a trigger when the question has since been deleted", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "Like this.");
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, question.id))
      .run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });
});

describe("dispatching a Discussion Question", () => {
  it("triggers discussion-question for the course's Instructor, with the asker as actor", async () => {
    const question = post(base.user.id, null, "How do generics work?");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([
      {
        workflowKey: "discussion-question",
        idempotencyKey: `discussion-question:${question.id}`,
        trigger: {
          actor: {
            id: String(base.user.id),
            name: "Test User",
            email: "test@example.com",
          },
          recipients: [
            {
              id: String(base.instructor.id),
              name: "Test Instructor",
              email: "instructor@example.com",
            },
          ],
          data: {
            lesson_id: lessonId,
            lesson_title: "Generics",
            course_id: base.course.id,
            course_title: "Test Course",
            comment_id: question.id,
            snippet: "How do generics work?",
            target_path: `/courses/test-course/lessons/${lessonId}?comment=${question.id}`,
          },
        },
      },
    ]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("notifies the Instructor when a Platform Admin asks", async () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    post(admin.id, null, "Is this current?");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    expect(sent[0].trigger.actor.id).toBe(String(admin.id));
    expect(sent[0].trigger.recipients.map((r) => r.id)).toEqual([
      String(base.instructor.id),
    ]);
  });

  it("drops the actor, so the Instructor asking on their own course closes the row without a trigger", async () => {
    post(base.instructor.id, null, "Pinned question.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("closes the row without a trigger when the question has since been deleted", async () => {
    const question = post(base.user.id, null, "How?");
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, question.id))
      .run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });
});

describe("the dispatcher", () => {
  it("once started, sends a reply after the comment service kicks it", async () => {
    const { sender, sent } = fakeSender();
    const stop = startNotificationDispatcher(db, sender, log);
    try {
      const question = askQuestion(base.user.id, "How?");
      const reply = post(base.instructor.id, question.id, "Like this.");
      // Nothing is sent while the poster's request is still running.
      expect(sent).toEqual([]);

      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0].idempotencyKey).toBe(`discussion-reply:${reply.id}`);
    } finally {
      stop();
    }
  });

  it("sends each row once", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
  });

  it("logs one line per trigger with the workflow key, recipients and Knock's response", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const { sender } = fakeSender({
      status: 200,
      body: { workflow_run_id: "run-42" },
    });

    await dispatchPendingNotifications(db, sender, log);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("discussion-reply");
    expect(lines[0]).toContain(`[${base.user.id}]`);
    expect(lines[0]).toContain("200");
    expect(lines[0]).toContain("run-42");
  });

  it("marks the row sent when the logging stand-in is used in place of Knock", async () => {
    const question = askQuestion(base.user.id, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const printed: string[] = [];

    await dispatchPendingNotifications(
      db,
      senderFromEnv({ NODE_ENV: "development" }, (line) => printed.push(line)),
      log
    );

    expect(printed[0]).toContain("would trigger discussion-reply");
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("does not throw when the sender throws", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    replyPending();
    const { sender } = scriptedSender(new Error("network down"));

    await expect(
      dispatchPendingNotifications(db, sender, log)
    ).resolves.toBeUndefined();
    expect(rows().slice(-1)[0].sentAt).toBeNull();
  });
});
