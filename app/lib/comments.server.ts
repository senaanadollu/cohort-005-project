import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { comments, lessons } from "~/db/schema";
import { validateCommentBody } from "~/lib/comments";
import { removeNotificationsFor, type KnockMessages } from "~/lib/knock.server";
import {
  NotificationType,
  kickDispatcher,
  recordNotification,
} from "~/lib/notifications.server";

// ─── Comments ───
// Creating a comment: a Discussion Question (top-level) or a Discussion Reply
// (one level deep). Both the lesson page and the Instructor questions page post
// through createComment. See GLOSSARY.md for the language.
//
// Takes the database first, so tests can hand in an in-memory one. Uses
// positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

type Comment = typeof comments.$inferSelect;

export type CreateCommentResult =
  | { ok: true; comment: Comment }
  | { ok: false; error: string };

export function createComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
): CreateCommentResult {
  const validated = validateCommentBody(body);
  if (!validated.ok) return validated;
  const { trimmed } = validated;

  const result = db.transaction((tx): CreateCommentResult => {
    const lesson = tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .get();
    if (!lesson) {
      return { ok: false, error: "Lesson not found" };
    }

    if (parentId !== null) {
      const parent = tx
        .select()
        .from(comments)
        .where(eq(comments.id, parentId))
        .get();
      if (!parent) {
        return { ok: false, error: "Parent comment not found" };
      }
      if (parent.lessonId !== lessonId) {
        return {
          ok: false,
          error: "Parent comment belongs to a different lesson",
        };
      }
      if (parent.parentId !== null) {
        return { ok: false, error: "Replies can only be one level deep" };
      }
    }

    const comment = tx
      .insert(comments)
      .values({ userId, lessonId, parentId, body: trimmed })
      .returning()
      .get();

    if (comment.parentId !== null) {
      recordNotification(tx, NotificationType.DiscussionReply, comment.id);
    } else {
      recordNotification(tx, NotificationType.DiscussionQuestion, comment.id);
    }

    return { ok: true, comment };
  });

  // The transaction has committed: send without the poster waiting.
  if (result.ok) kickDispatcher();
  return result;
}

// Soft deletes a comment. The author or staff may delete. Throws an Error
// with a message for the user when they may not. Afterwards its Notification
// is archived in Knock, so it leaves the recipient's Notification Feed. That
// runs in the background and never fails or delays the delete.
export function deleteComment(
  db: Db,
  commentId: number,
  userId: number,
  isStaff: boolean,
  messages: KnockMessages
): Comment {
  const existing = db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .get();
  if (!existing) {
    throw new Error("Comment not found");
  }
  if (existing.userId !== userId && !isStaff) {
    throw new Error("You can only delete your own comments");
  }
  if (existing.deletedAt !== null) {
    return existing;
  }

  const deleted = db
    .update(comments)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(comments.id, commentId))
    .returning()
    .get();

  const workflowKey =
    deleted.parentId === null
      ? NotificationType.DiscussionQuestion
      : NotificationType.DiscussionReply;
  void Promise.resolve()
    .then(() => removeNotificationsFor(messages, workflowKey, deleted.id))
    .catch((error) =>
      console.error(
        `[notifications] could not remove ${workflowKey}:${deleted.id} from Knock`,
        error
      )
    );
  return deleted;
}
