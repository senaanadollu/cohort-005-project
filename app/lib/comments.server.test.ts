import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment, deleteComment } from "./comments.server";
import type { KnockMessages } from "./knock.server";
import { setDispatcherKick } from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

describe("createComment", () => {
  it("creates a Discussion Question as a top-level comment", () => {
    const result = createComment(db, base.user.id, lessonId, null, "How?");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comment).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "How?",
    });
  });

  it("creates a Discussion Reply under a Discussion Question", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");

    const result = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.comment.id,
      "Like this."
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comment).toMatchObject({
      userId: base.instructor.id,
      parentId: question.comment.id,
      body: "Like this.",
    });
  });

  it("trims the body before saving it", () => {
    const result = createComment(db, base.user.id, lessonId, null, "  Hi  \n");

    expect(result.ok && result.comment.body).toBe("Hi");
  });

  it("refuses an empty comment", () => {
    expect(createComment(db, base.user.id, lessonId, null, "   ")).toEqual({
      ok: false,
      error: "Comment cannot be empty",
    });
    expect(db.select().from(schema.comments).all()).toHaveLength(0);
  });

  it("refuses a comment over 5000 characters", () => {
    expect(
      createComment(db, base.user.id, lessonId, null, "a".repeat(5001))
    ).toEqual({
      ok: false,
      error: "Comment must be 5000 characters or fewer",
    });
  });

  it("accepts a comment of exactly 5000 characters", () => {
    expect(
      createComment(db, base.user.id, lessonId, null, "a".repeat(5000)).ok
    ).toBe(true);
  });

  it("refuses a comment on a lesson that does not exist", () => {
    expect(createComment(db, base.user.id, 9999, null, "Hi")).toEqual({
      ok: false,
      error: "Lesson not found",
    });
  });

  it("refuses a Discussion Reply to a comment that does not exist", () => {
    expect(createComment(db, base.user.id, lessonId, 9999, "Hi")).toEqual({
      ok: false,
      error: "Parent comment not found",
    });
  });

  it("refuses a Discussion Reply to a question on a different lesson", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    const module = db.select().from(schema.modules).get()!;
    const otherLesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Lesson 2", position: 2 })
      .returning()
      .get();

    expect(
      createComment(
        db,
        base.user.id,
        otherLesson.id,
        question.comment.id,
        "Hi"
      )
    ).toEqual({
      ok: false,
      error: "Parent comment belongs to a different lesson",
    });
  });

  it("refuses a Discussion Reply to a Discussion Reply", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.comment.id,
      "Like this."
    );
    if (!reply.ok) throw new Error("setup failed");

    expect(
      createComment(db, base.user.id, lessonId, reply.comment.id, "Thanks")
    ).toEqual({
      ok: false,
      error: "Replies can only be one level deep",
    });
    // The refused reply left no row behind: just the question and its reply.
    expect(db.select().from(schema.comments).all()).toHaveLength(2);
  });
});

describe("createComment records Notifications", () => {
  function pendingNotifications() {
    return db
      .select()
      .from(schema.pendingNotifications)
      .all()
      .filter((row) => row.type === schema.NotificationType.DiscussionReply);
  }

  it("records a Discussion Reply Notification with the reply", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");

    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.comment.id,
      "Like this."
    );
    if (!reply.ok) throw new Error("setup failed");

    expect(pendingNotifications()).toEqual([
      expect.objectContaining({
        type: "discussion-reply",
        subjectId: reply.comment.id,
        idempotencyKey: `discussion-reply:${reply.comment.id}`,
        sentAt: null,
      }),
    ]);
  });

  it("kicks the dispatcher once the reply and its Notification are committed", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    const seenAtKick: number[] = [];
    setDispatcherKick(() => seenAtKick.push(pendingNotifications().length));

    try {
      createComment(
        db,
        base.instructor.id,
        lessonId,
        question.comment.id,
        "Hi"
      );
      createComment(db, base.instructor.id, lessonId, 9999, "Refused");
    } finally {
      setDispatcherKick(undefined);
    }

    expect(seenAtKick).toEqual([1]);
  });

  it("records no Discussion Reply Notification for a Discussion Question", () => {
    createComment(db, base.user.id, lessonId, null, "How?");

    expect(pendingNotifications()).toEqual([]);
  });

  it("records nothing when the reply is refused", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.comment.id,
      "Like this."
    );
    if (!reply.ok) throw new Error("setup failed");

    createComment(db, base.user.id, lessonId, reply.comment.id, "Thanks");
    createComment(db, base.user.id, lessonId, question.comment.id, "   ");

    expect(pendingNotifications().map((row) => row.subjectId)).toEqual([
      reply.comment.id,
    ]);
  });

  it("records nothing when writing the Notification fails, and the reply is rolled back with it", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    // The next comment id is taken, so recording its Notification fails.
    db.insert(schema.pendingNotifications)
      .values({
        type: schema.NotificationType.DiscussionReply,
        subjectId: question.comment.id + 1,
        idempotencyKey: `discussion-reply:${question.comment.id + 1}`,
      })
      .run();

    expect(() =>
      createComment(
        db,
        base.instructor.id,
        lessonId,
        question.comment.id,
        "Like this."
      )
    ).toThrow();
    expect(db.select().from(schema.comments).all()).toHaveLength(1);
  });
});

describe("recording a Discussion Question", () => {
  it("records a discussion-question row for a Discussion Question", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");

    expect(db.select().from(schema.pendingNotifications).all()).toMatchObject([
      {
        type: "discussion-question",
        subjectId: question.comment.id,
        idempotencyKey: `discussion-question:${question.comment.id}`,
        sentAt: null,
      },
    ]);
  });

  it("records a discussion-reply row, not a second discussion-question row, for a Reply", () => {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    createComment(db, base.instructor.id, lessonId, question.comment.id, "So.");

    expect(
      db
        .select()
        .from(schema.pendingNotifications)
        .all()
        .map((row) => row.type)
    ).toEqual(["discussion-question", "discussion-reply"]);
  });
});

describe("deleteComment", () => {
  // Knock holds one message per comment, found under its workflow.
  function fakeMessages() {
    const archived: string[] = [];
    const listedFor: string[] = [];
    const messages: KnockMessages = {
      async list(workflowKey, triggerData) {
        listedFor.push(`${workflowKey}:${JSON.stringify(triggerData)}`);
        return {
          items: [
            { id: `msg-${workflowKey}`, data: { comment_id: 1 } },
            { id: `msg-${workflowKey}`, data: { comment_id: 2 } },
          ],
        };
      },
      async archive(ids) {
        archived.push(...ids);
      },
    };
    return { messages, archived, listedFor };
  }

  function ask() {
    const question = createComment(db, base.user.id, lessonId, null, "How?");
    if (!question.ok) throw new Error("setup failed");
    return question.comment;
  }

  it("soft deletes the comment for its author", () => {
    const question = ask();

    const deleted = deleteComment(
      db,
      question.id,
      base.user.id,
      false,
      fakeMessages().messages
    );

    expect(deleted.deletedAt).not.toBeNull();
  });

  it("lets staff delete someone else's comment, and refuses anyone else", () => {
    const question = ask();
    const { messages } = fakeMessages();

    expect(() =>
      deleteComment(db, question.id, base.instructor.id, false, messages)
    ).toThrow("You can only delete your own comments");
    expect(
      deleteComment(db, question.id, base.instructor.id, true, messages)
        .deletedAt
    ).not.toBeNull();
  });

  it("throws for a comment that does not exist", () => {
    expect(() =>
      deleteComment(db, 9999, base.user.id, false, fakeMessages().messages)
    ).toThrow("Comment not found");
  });

  it("archives the Discussion Question's Notification in Knock", async () => {
    const question = ask();
    const { messages, archived, listedFor } = fakeMessages();

    deleteComment(db, question.id, base.user.id, false, messages);

    await vi.waitFor(() => expect(archived).toHaveLength(1));
    expect(listedFor).toEqual([
      `discussion-question:{"comment_id":${question.id}}`,
    ]);
  });

  it("archives a Discussion Reply's Notification under the discussion-reply workflow", async () => {
    const question = ask();
    const reply = createComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "So."
    );
    if (!reply.ok) throw new Error("setup failed");
    const { messages, listedFor } = fakeMessages();

    deleteComment(db, reply.comment.id, base.instructor.id, false, messages);

    await vi.waitFor(() => expect(listedFor).toHaveLength(1));
    expect(listedFor[0]).toBe(
      `discussion-reply:{"comment_id":${reply.comment.id}}`
    );
  });

  it("does not call Knock again for a comment that was already deleted", async () => {
    const question = ask();
    const { messages, listedFor } = fakeMessages();
    deleteComment(db, question.id, base.user.id, false, messages);
    await vi.waitFor(() => expect(listedFor).toHaveLength(1));

    deleteComment(db, question.id, base.user.id, false, messages);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(listedFor).toHaveLength(1);
  });

  it("does not wait for Knock", () => {
    const question = ask();
    const hanging: KnockMessages = {
      list: () => new Promise(() => {}),
      archive: () => new Promise(() => {}),
    };

    const deleted = deleteComment(db, question.id, base.user.id, false, hanging);

    expect(deleted.deletedAt).not.toBeNull();
  });

  it("does not fail when Knock does", async () => {
    const question = ask();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: KnockMessages = {
      list: () => Promise.reject(new Error("Knock is down")),
      archive: () => Promise.reject(new Error("Knock is down")),
    };

    try {
      const deleted = deleteComment(db, question.id, base.user.id, false, failing);

      expect(deleted.deletedAt).not.toBeNull();
      await vi.waitFor(() => expect(error).toHaveBeenCalled());
    } finally {
      error.mockRestore();
    }
  });

  it("does not fail when Knock throws at once", () => {
    const question = ask();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing: KnockMessages = {
      list: () => {
        throw new Error("not even a promise");
      },
      archive: () => Promise.resolve(),
    };

    try {
      expect(
        deleteComment(db, question.id, base.user.id, false, throwing).deletedAt
      ).not.toBeNull();
    } finally {
      error.mockRestore();
    }
  });
});
