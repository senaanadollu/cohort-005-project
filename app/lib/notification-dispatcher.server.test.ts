import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";
import {
  dispatchPendingNotifications,
  startNotificationDispatcher,
} from "./notification-dispatcher.server";
import {
  senderFromEnv,
  type KnockResponse,
  type KnockSender,
  type WorkflowTrigger,
} from "./knock.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

type SentTrigger = {
  workflowKey: string;
  trigger: WorkflowTrigger;
  idempotencyKey: string;
};

function fakeSender(
  response: KnockResponse = { status: 200, body: { workflow_run_id: "run-1" } }
) {
  const sent: SentTrigger[] = [];
  const sender: KnockSender = {
    async trigger(workflowKey, trigger, idempotencyKey) {
      sent.push({ workflowKey, trigger, idempotencyKey });
      return response;
    },
  };
  return { sender, sent };
}

const lines: string[] = [];
const log = (line: string) => lines.push(line);

function rows() {
  return db.select().from(schema.pendingNotifications).all();
}

function post(userId: number, parentId: number | null, body: string) {
  const result = createComment(db, userId, lessonId, parentId, body);
  if (!result.ok) throw new Error(result.error);
  return result.comment;
}

beforeEach(() => {
  lines.length = 0;
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Generics", position: 1 })
    .returning()
    .get().id;
});

describe("dispatching a Discussion Reply", () => {
  it("triggers discussion-reply for the question's author, with the replier as actor", async () => {
    const question = post(base.user.id, null, "How do generics work?");
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
    expect(rows()[0].sentAt).not.toBeNull();
  });

  it("identifies people with their avatar when they have one", async () => {
    db.update(schema.users)
      .set({ avatarUrl: "https://example.com/u.png" })
      .where(eq(schema.users.id, base.user.id))
      .run();
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent[0].trigger.recipients[0].avatar).toBe(
      "https://example.com/u.png"
    );
    expect(sent[0].trigger.actor).not.toHaveProperty("avatar");
  });

  it("reads the current names when it sends, not those at the time of the reply", async () => {
    const question = post(base.user.id, null, "How?");
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
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "a".repeat(600));
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent[0].trigger.data.snippet).toBe(`${"a".repeat(500)}…`);
  });

  it("drops the actor, so a reply by the question's own author closes the row without a trigger", async () => {
    const question = post(base.user.id, null, "How?");
    post(base.user.id, question.id, "Never mind, solved it.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows()[0].sentAt).not.toBeNull();
  });

  it("closes the row without a trigger when the reply has since been deleted", async () => {
    const question = post(base.user.id, null, "How?");
    const reply = post(base.instructor.id, question.id, "Like this.");
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, reply.id))
      .run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows()[0].sentAt).not.toBeNull();
  });

  it("closes the row without a trigger when the question has since been deleted", async () => {
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "Like this.");
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, question.id))
      .run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows()[0].sentAt).not.toBeNull();
  });
});

describe("the dispatcher", () => {
  it("once started, sends a reply after the comment service kicks it", async () => {
    const { sender, sent } = fakeSender();
    const stop = startNotificationDispatcher(db, sender, log);
    try {
      const question = post(base.user.id, null, "How?");
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
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
  });

  it("logs one line per trigger with the workflow key, recipients and Knock's response", async () => {
    const question = post(base.user.id, null, "How?");
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
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const printed: string[] = [];

    await dispatchPendingNotifications(
      db,
      senderFromEnv({ NODE_ENV: "development" }, (line) => printed.push(line)),
      log
    );

    expect(printed[0]).toContain("would trigger discussion-reply");
    expect(rows()[0].sentAt).not.toBeNull();
  });

  it("leaves the row pending when Knock refuses the trigger", async () => {
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const { sender } = fakeSender({ status: 500, body: "boom" });

    await dispatchPendingNotifications(db, sender, log);

    expect(rows()[0].sentAt).toBeNull();
  });

  it("leaves the row pending, and does not throw, when the sender throws", async () => {
    const question = post(base.user.id, null, "How?");
    post(base.instructor.id, question.id, "Like this.");
    const sender: KnockSender = {
      async trigger() {
        throw new Error("network down");
      },
    };

    await expect(
      dispatchPendingNotifications(db, sender, log)
    ).resolves.toBeUndefined();
    expect(rows()[0].sentAt).toBeNull();
  });
});
