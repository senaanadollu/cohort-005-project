import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { comments, lessons } from "~/db/schema";
import { validateCommentBody } from "~/lib/comments";

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

  return db.transaction((tx): CreateCommentResult => {
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

    return { ok: true, comment };
  });
}
