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

// Answers with each response in turn, then keeps repeating the last one. An
// Error stands for a network failure: the sender throws it.
function scriptedSender(...responses: (KnockResponse | Error)[]) {
  const sent: SentTrigger[] = [];
  const sender: KnockSender = {
    async trigger(workflowKey, trigger, idempotencyKey) {
      sent.push({ workflowKey, trigger, idempotencyKey });
      const response = responses[Math.min(sent.length, responses.length) - 1];
      if (response instanceof Error) throw response;
      return response;
    },
  };
  return { sender, sent };
}

const ok: KnockResponse = { status: 200, body: { workflow_run_id: "run-1" } };
const down: KnockResponse = { status: 503, body: "unavailable" };

const START = new Date("2026-11-18T09:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

function at(msAfterStart: number) {
  vi.setSystemTime(START.getTime() + msAfterStart);
}

function replyPending() {
  const question = askQuestion(base.user.id, "How?");
  return post(base.instructor.id, question.id, "Like this.");
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

// Asks a Discussion Question whose own Notification is already settled, so a
// test about the Reply that follows sees only the Reply's trigger.
function askQuestion(userId: number, body: string) {
  const question = post(userId, null, body);
  db.update(schema.pendingNotifications)
    .set({ sentAt: new Date().toISOString() })
    .where(eq(schema.pendingNotifications.subjectId, question.id))
    .run();
  return question;
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

describe("retrying a failed send", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    return () => vi.useRealTimers();
  });

  it("retries a row Knock could not take, and marks it sent once a later attempt succeeds", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    await dispatchPendingNotifications(db, sender, log);
    expect(rows().slice(-1)[0].sentAt).toBeNull();

    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(2);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
    expect(rows().slice(-1)[0].failedAt).toBeNull();
  });

  it("waits 90 seconds before the first retry and doubles the wait after each failure", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(down);
    const sweepAt = async (ms: number) => {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    };

    await sweepAt(0);
    await sweepAt(89 * SECOND);
    expect(sent).toHaveLength(1);
    await sweepAt(90 * SECOND);
    expect(sent).toHaveLength(2);

    // Second retry 3 minutes after the first retry.
    await sweepAt(90 * SECOND + 179 * SECOND);
    expect(sent).toHaveLength(2);
    await sweepAt(90 * SECOND + 180 * SECOND);
    expect(sent).toHaveLength(3);

    // Third retry 6 minutes after the second.
    await sweepAt(270 * SECOND + 359 * SECOND);
    expect(sent).toHaveLength(3);
    await sweepAt(270 * SECOND + 360 * SECOND);
    expect(sent).toHaveLength(4);
  });

  it("retries a 429, a network error and a 5xx alike", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(
      { status: 429, body: { code: "rate_limited" } },
      new Error("ECONNRESET"),
      { status: 500, body: "boom" },
      ok
    );

    for (const ms of [0, 1 * HOUR, 2 * HOUR, 3 * HOUR]) {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    }

    expect(sent).toHaveLength(4);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("gives up after 10 attempts, about 12 hours in and well inside Knock's 24-hour window, and keeps the row as failed", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    const { sender, sent } = scriptedSender(down);

    // Sweep every minute for a day.
    for (let ms = 0; ms <= 24 * HOUR; ms += MINUTE) {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    }

    expect(sent).toHaveLength(10);
    const row = rows().slice(-1)[0];
    expect(row.sentAt).toBeNull();
    const failedAfter = new Date(row.failedAt ?? "").getTime() - START.getTime();
    expect(failedAfter).toBeGreaterThan(11 * HOUR);
    expect(failedAfter).toBeLessThan(14 * HOUR);
    expect(errors.mock.calls.at(-1)?.join(" ")).toContain("giving up");
    errors.mockRestore();
  });

  it("makes no attempt more than 20 hours after the first, even when the server was down in between", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    at(0);
    await dispatchPendingNotifications(db, sender, log);
    // The server comes back the next morning.
    at(21 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    expect(rows().slice(-1)[0].failedAt).not.toBeNull();
    errors.mockRestore();
  });

  it("marks the row failed on the first attempt when Knock answers with a 4xx other than 429, and logs it as an error", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    const { sender, sent } = scriptedSender(
      { status: 422, body: { code: "invalid_params" } },
      ok
    );

    await dispatchPendingNotifications(db, sender, log);
    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    const row = rows().slice(-1)[0];
    expect(row.failedAt).not.toBeNull();
    expect(row.sentAt).toBeNull();
    expect(errors.mock.calls.flat().join(" ")).toContain("invalid_params");
    errors.mockRestore();
  });

  it("retries with the same idempotency key and the same body, even when a name changed in between", async () => {
    const reply = replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    await dispatchPendingNotifications(db, sender, log);
    db.update(schema.users)
      .set({ name: "Renamed Instructor" })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(2);
    expect(sent[1].idempotencyKey).toBe(`discussion-reply:${reply.id}`);
    expect(sent[1].idempotencyKey).toBe(sent[0].idempotencyKey);
    expect(sent[1].trigger).toEqual(sent[0].trigger);
    expect(sent[1].trigger.actor.name).toBe("Test Instructor");
  });

  it("closes the row without a retry when the reply was deleted after a failed attempt", async () => {
    const reply = replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    await dispatchPendingNotifications(db, sender, log);
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, reply.id))
      .run();
    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });
});

describe("the sweep", () => {
  it("retries a failed row about every 30 seconds once the dispatcher is started", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    at(0);
    replyPending();
    const { sender, sent } = scriptedSender(down, ok);
    const stop = startNotificationDispatcher(db, sender, log);
    try {
      await vi.waitFor(() => expect(sent).toHaveLength(1));

      // Past the 90-second backoff; the next sweep picks the row up.
      at(91 * SECOND);
      vi.advanceTimersByTime(30 * SECOND);
      expect(sent).toHaveLength(1);
      vi.advanceTimersByTime(30 * SECOND);
      vi.advanceTimersByTime(30 * SECOND);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      await vi.waitFor(() => expect(rows().slice(-1)[0].sentAt).not.toBeNull());
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it("sends a row left pending by a restart when the dispatcher starts", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(ok);
    const stop = startNotificationDispatcher(db, sender, log);
    try {
      await vi.waitFor(() => expect(sent).toHaveLength(1));
    } finally {
      stop();
    }
  });
});
