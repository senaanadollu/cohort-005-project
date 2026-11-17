// PROTOTYPE — throwaway Knock spike for the wayfinder ticket
// "Does Knock hold up against Cadence?". Not production code: no tests, no
// error handling, no abstractions. Lives only on the prototype/knock-spike branch.

import Knock, { signUserToken } from "@knocklabs/node";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { comments, lessons, users } from "~/db/schema";

export const DISCUSSION_REPLY_WORKFLOW = "discussion-reply";
export const NEW_ENROLLMENT_WORKFLOW = "new-enrollment";
// Category key shared by the workflow and the preference entries.
export const NEW_ENROLLMENT_CATEGORY = "new-enrollment";

export const knock = new Knock({ apiKey: process.env.KNOCK_API_KEY });

export function knockUserId(userId: number) {
  return String(userId);
}

// Check 1: the server signs an RS256 token for whoever the session says is the
// current user. signUserToken reads KNOCK_SIGNING_KEY from the environment.
export function signFeedToken(userId: number) {
  return signUserToken(knockUserId(userId), { expiresInSeconds: 60 * 60 });
}

function recipient(userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`No user ${userId}`);
  // Inline identify: Knock upserts the user on trigger, so no separate sync.
  return { id: knockUserId(user.id), name: user.name, email: user.email };
}

// Check 2: Discussion Reply → question author.
export async function notifyDiscussionReply(replyId: number) {
  const reply = db.select().from(comments).where(eq(comments.id, replyId)).get();
  if (!reply || reply.parentId === null) return null;
  const question = db
    .select()
    .from(comments)
    .where(eq(comments.id, reply.parentId))
    .get();
  if (!question || question.userId === reply.userId) return null;
  const lesson = db
    .select()
    .from(lessons)
    .where(eq(lessons.id, reply.lessonId))
    .get();

  return knock.workflows.trigger(DISCUSSION_REPLY_WORKFLOW, {
    recipients: [recipient(question.userId)],
    actor: recipient(reply.userId),
    data: {
      lesson_title: lesson?.title ?? "a lesson",
      reply_excerpt: reply.body.slice(0, 140),
      reply_id: reply.id,
    },
  });
}

// Synthetic version for the spike page: no comment rows involved.
export function triggerTestDiscussionReply(toUserId: number, fromUserId: number) {
  return knock.workflows.trigger(DISCUSSION_REPLY_WORKFLOW, {
    recipients: [recipient(toUserId)],
    actor: recipient(fromUserId),
    data: {
      lesson_title: "Spike lesson",
      reply_excerpt: `Test reply sent at ${new Date().toLocaleTimeString()}`,
      reply_id: 0,
    },
  });
}

// Check 4: new Enrollment → Instructor, off by default.
export function triggerTestNewEnrollment(toUserId: number, fromUserId: number) {
  return knock.workflows.trigger(NEW_ENROLLMENT_WORKFLOW, {
    recipients: [recipient(toUserId)],
    actor: recipient(fromUserId),
    data: { course_title: "Spike course" },
  });
}

export async function getPreferences(userId: number) {
  try {
    return await knock.users.getPreferences(knockUserId(userId), "default");
  } catch (e) {
    return { error: String(e) };
  }
}

export function setNewEnrollmentInApp(userId: number, enabled: boolean) {
  return knock.users.setPreferences(knockUserId(userId), "default", {
    categories: {
      [NEW_ENROLLMENT_CATEGORY]: { channel_types: { in_app_feed: enabled } },
    },
  });
}

export function clearPreferences(userId: number) {
  return knock.users.unsetPreferences(knockUserId(userId), "default");
}
