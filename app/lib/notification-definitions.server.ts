import { and, eq, isNull } from "drizzle-orm";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { NotificationType, type Queryable } from "~/lib/notifications.server";

// ─── What each Notification says, and to whom ───
// One builder per NotificationType. The dispatcher calls it when it sends, so
// it reads the current data. It returns null when the subject is gone, and the
// row is closed without a trigger. It may list the actor among the recipients:
// the dispatcher drops the actor for every Notification.

type User = typeof users.$inferSelect;

export type NotificationEvent = {
  actor: User;
  recipients: User[];
  // Facts about the event for the feed row and the email.
  data: Record<string, unknown>;
};

export type NotificationBuilder = (
  db: Queryable,
  subjectId: number
) => NotificationEvent | null;

// About the length the Discussion emails quote.
const SNIPPET_LENGTH = 500;

export function snippet(body: string): string {
  return body.length > SNIPPET_LENGTH
    ? `${body.slice(0, SNIPPET_LENGTH)}…`
    : body;
}

export function commentPath(
  courseSlug: string,
  lessonId: number,
  commentId: number
): string {
  return `/courses/${courseSlug}/lessons/${lessonId}?comment=${commentId}`;
}

function liveComment(db: Queryable, commentId: number) {
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), isNull(comments.deletedAt)))
    .get();
}

function user(db: Queryable, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

// Subject: the reply. Recipient: the Discussion Question's author only.
function discussionReply(
  db: Queryable,
  replyId: number
): NotificationEvent | null {
  const reply = liveComment(db, replyId);
  if (!reply || reply.parentId === null) return null;
  const question = liveComment(db, reply.parentId);
  if (!question) return null;

  const place = db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(lessons.id, reply.lessonId))
    .get();
  const actor = user(db, reply.userId);
  const author = user(db, question.userId);
  if (!place || !actor || !author) return null;

  return {
    actor,
    recipients: [author],
    data: {
      lesson_id: place.lessonId,
      lesson_title: place.lessonTitle,
      course_id: place.courseId,
      course_title: place.courseTitle,
      comment_id: reply.id,
      snippet: snippet(reply.body),
      target_path: commentPath(place.courseSlug, place.lessonId, reply.id),
    },
  };
}

// Adding a NotificationType without a builder here is a type error.
export const notificationBuilders: Record<
  NotificationType,
  NotificationBuilder
> = {
  [NotificationType.DiscussionReply]: discussionReply,
};
