import { and, count, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import {
  comments,
  courseRatings,
  courses,
  lessons,
  modules,
  UserRole,
  users,
} from "~/db/schema";
import { type AnalyticsRange, rangeStart } from "~/lib/analytics";

import { type Db, scopeOn } from "./scope";

// ─── Feedback ───
// What students say back: the ratings they leave and the questions they ask.

export type RatingSummary = {
  average: number | null;
  count: number;
};

export type UnansweredQuestions = {
  inRange: number;
  older: number;
};

export function getRatingSummary(
  db: Db,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
): RatingSummary {
  const row = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: count(courseRatings.id),
    })
    .from(courseRatings)
    .innerJoin(courses, eq(courseRatings.courseId, courses.id))
    .where(scopeOn(courseRatings.createdAt, instructorId, range, now))
    .get();

  if (!row || row.count === 0 || row.average === null) {
    return { average: null, count: 0 };
  }

  return { average: Math.round(row.average * 10) / 10, count: row.count };
}

/**
 * Unanswered questions. A question qualifies when it is top-level, not
 * deleted, not written by staff, and has no reply from the course's
 * instructor or an admin.
 */
export function getUnansweredQuestions(
  db: Db,
  instructorId: number | null,
  range: AnalyticsRange,
  now: Date
): UnansweredQuestions {
  const questionsSince = rangeStart(range, now);
  const questionAuthor = alias(users, "author");
  const reply = alias(comments, "reply");
  const replyAuthor = alias(users, "reply_author");

  // Correlated: matches a live reply, by staff, to the outer question.
  const staffReply = db
    .select({ one: sql`1` })
    .from(reply)
    .innerJoin(replyAuthor, eq(replyAuthor.id, reply.userId))
    .where(
      and(
        eq(reply.parentId, comments.id),
        isNull(reply.deletedAt),
        or(
          eq(replyAuthor.role, UserRole.Admin),
          eq(reply.userId, courses.instructorId)
        )
      )
    );

  const questionConditions = [
    isNull(comments.parentId),
    isNull(comments.deletedAt),
    // Staff asking their own question shouldn't queue up as work for themselves.
    ne(questionAuthor.role, UserRole.Admin),
    ne(comments.userId, courses.instructorId),
    notExists(staffReply),
  ];

  if (instructorId !== null) {
    questionConditions.push(eq(courses.instructorId, instructorId));
  }

  const questionRow = db
    .select({
      inRange:
        questionsSince === null
          ? count(comments.id)
          : sql<number>`sum(case when ${comments.createdAt} >= ${questionsSince} then 1 else 0 end)`,
      total: count(comments.id),
    })
    .from(comments)
    .innerJoin(questionAuthor, eq(comments.userId, questionAuthor.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(...questionConditions))
    .get();

  // sum() is null over an empty set; count() is already 0.
  const questionsInRange = Number(questionRow?.inRange ?? 0);
  return {
    inRange: questionsInRange,
    older: (questionRow?.total ?? 0) - questionsInRange,
  };
}
