import { and, count, eq, isNull } from "drizzle-orm";
import {
  comments,
  coupons,
  courses,
  enrollments,
  lessons,
  modules,
  purchases,
  users,
} from "~/db/schema";
import { NotificationType, type Queryable } from "~/lib/notifications.server";
import {
  refundRequestApproved,
  refundRequestDeclined,
  refundRequestOpened,
} from "~/lib/refund-notifications.server";

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

// Subject: the Seat. Recipient: the Team Admin who owns the Team Licence (the
// buyer of the Purchase that granted the Seat). Actor: the Student who claimed
// it. `seats_left` is the licence's Unclaimed Seats at the time of sending.
function seatClaimed(db: Queryable, seatId: number): NotificationEvent | null {
  const seat = db.select().from(coupons).where(eq(coupons.id, seatId)).get();
  if (!seat || seat.redeemedByUserId === null) return null;

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  const actor = user(db, seat.redeemedByUserId);
  const teamAdmin = purchase ? user(db, purchase.userId) : undefined;
  if (!purchase || !course || !actor || !teamAdmin) return null;

  const unclaimed = db
    .select({ total: count() })
    .from(coupons)
    .where(
      and(
        eq(coupons.purchaseId, seat.purchaseId),
        isNull(coupons.redeemedByUserId)
      )
    )
    .get();

  return {
    actor,
    recipients: [teamAdmin],
    data: {
      seat_id: seat.id,
      student_name: actor.name,
      course_id: course.id,
      course_title: course.title,
      seats_left: unclaimed?.total ?? 0,
      target_path: `/team?seat=${seat.id}`,
    },
  };
}

// Subject: the Enrollment. Recipient: the course's Instructor. Actor: the
// Student who enrolled. Always triggered; the Enrollments preference (off by
// default) suppresses it in Knock.
function newEnrollment(
  db: Queryable,
  enrollmentId: number
): NotificationEvent | null {
  const enrollment = db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .get();
  if (!enrollment) return null;

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, enrollment.courseId))
    .get();
  const actor = user(db, enrollment.userId);
  const instructor = course ? user(db, course.instructorId) : undefined;
  if (!course || !actor || !instructor) return null;

  return {
    actor,
    recipients: [instructor],
    data: {
      enrollment_id: enrollment.id,
      student_id: actor.id,
      student_name: actor.name,
      course_id: course.id,
      course_title: course.title,
      target_path: `/instructor/${course.id}/students?student=${actor.id}`,
    },
  };
}

// Adding a NotificationType without a builder here is a type error.
export const notificationBuilders: Record<
  NotificationType,
  NotificationBuilder
> = {
  [NotificationType.DiscussionReply]: discussionReply,
  [NotificationType.RefundRequestOpened]: refundRequestOpened,
  [NotificationType.RefundRequestApproved]: refundRequestApproved,
  [NotificationType.RefundRequestDeclined]: refundRequestDeclined,
  [NotificationType.SeatClaimed]: seatClaimed,
  [NotificationType.NewEnrollment]: newEnrollment,
};
