import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "~/lib/comments.server";
import type {
  KnockResponse,
  KnockSender,
  WorkflowTrigger,
} from "~/lib/knock.server";

// Shared by the dispatcher test files: fake Knock senders and a course with
// one lesson to hold Discussions.

export type SentTrigger = {
  workflowKey: string;
  trigger: WorkflowTrigger;
  idempotencyKey: string;
};

export const ok: KnockResponse = {
  status: 200,
  body: { workflow_run_id: "run-1" },
};
export const down: KnockResponse = { status: 503, body: "unavailable" };

export function fakeSender(response: KnockResponse = ok) {
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
export function scriptedSender(...responses: (KnockResponse | Error)[]) {
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

export function discussionFixture() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  const lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Generics", position: 1 })
    .returning()
    .get().id;

  function rows() {
    return db.select().from(schema.pendingNotifications).all();
  }

  function post(userId: number, parentId: number | null, body: string) {
    const result = createComment(db, userId, lessonId, parentId, body);
    if (!result.ok) throw new Error(result.error);
    return result.comment;
  }

  // Asks a Discussion Question whose own Notification is already settled, so
  // a test about the Reply that follows sees only the Reply's trigger.
  function askQuestion(userId: number, body: string) {
    const question = post(userId, null, body);
    db.update(schema.pendingNotifications)
      .set({ sentAt: new Date().toISOString() })
      .where(eq(schema.pendingNotifications.subjectId, question.id))
      .run();
    return question;
  }

  function replyPending() {
    const question = askQuestion(base.user.id, "How?");
    return post(base.instructor.id, question.id, "Like this.");
  }

  return { db, base, lessonId, rows, post, askQuestion, replyPending };
}
