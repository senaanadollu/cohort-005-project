// PROTOTYPE — throwaway Knock spike for the wayfinder ticket
// "Does Knock hold up against Cadence?". Not production code: no tests, no
// error handling, no abstractions. Lives only on the prototype/knock-spike branch.

import Knock, { signUserToken } from "@knocklabs/node";
import { eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { comments, courses, lessons, modules, users, UserRole } from "~/db/schema";

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
      // Feed prototype fields: the feed renders rows from these.
      subject: lesson?.title ?? "a lesson",
      excerpt: reply.body.slice(0, 140),
      url: lesson ? `${lessonUrl(lesson.id)}#comment-${reply.id}` : "/",
    },
  });
}

function lessonUrl(lessonId: number) {
  const row = db
    .select({ slug: courses.slug })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
  return row ? `/courses/${row.slug}/lessons/${lessonId}` : "/";
}

// PROTOTYPE (Notification Feed look): send a handful of catalogue
// Notifications to the current user, shaped by their role, using real
// people, courses and lessons from the database so the rows look plausible.
export async function sendSampleNotifications(
  toUserId: number,
  opts: { isTeamAdmin: boolean }
) {
  const me = db.select().from(users).where(eq(users.id, toUserId)).get()!;
  const others = db.select().from(users).where(ne(users.id, toUserId)).all();
  const students = others.filter((u) => u.role === UserRole.Student);
  const pick = (i: number) => students[i % students.length];
  const course = db.select().from(courses).get()!;
  const lesson = db.select().from(lessons).get()!;
  const send = (
    key: string,
    actorId: number | null,
    data: Record<string, unknown>
  ) =>
    knock.workflows.trigger(key, {
      recipients: [recipient(toUserId)],
      ...(actorId ? { actor: recipient(actorId) } : {}),
      data,
    });

  // Point the discussion samples at real comments so the deep link lands on
  // something: the excerpt text is made up, the target comment is real.
  const allComments = db.select().from(comments).all().filter((c) => !c.deletedAt);
  const realReplies = allComments.filter((c) => c.parentId !== null);
  const realQuestions = allComments.filter((c) => c.parentId === null);
  const commentUrl = (pool: typeof allComments, i: number) => {
    const c = pool[i % Math.max(1, pool.length)];
    return c ? `${lessonUrl(c.lessonId)}#comment-${c.id}` : lessonUrl(lesson.id);
  };
  const lessonTitle = (pool: typeof allComments, i: number) => {
    const c = pool[i % Math.max(1, pool.length)];
    const l = c && db.select().from(lessons).where(eq(lessons.id, c.lessonId)).get();
    return l?.title ?? lesson.title;
  };
  const reply = (i: number, excerpt: string) =>
    send("discussion-reply", pick(i).id, {
      subject: lessonTitle(realReplies, i),
      excerpt,
      url: commentUrl(realReplies, i),
    });
  const question = (i: number, excerpt: string) =>
    send("discussion-question", pick(i).id, {
      subject: lessonTitle(realQuestions, i),
      excerpt,
      url: commentUrl(realQuestions, i),
    });
  const refundOpened = (i: number, excerpt: string) =>
    send("refund-request-opened", pick(i).id, {
      subject: course.title,
      amount: "$49.00",
      excerpt,
      url: "/admin/refunds",
    });

  const jobs: Promise<unknown>[] = [];
  if (me.role === UserRole.Admin) {
    jobs.push(
      refundOpened(0, "I bought this by mistake, I meant to get the Node course."),
      refundOpened(1, "The course is more advanced than I expected."),
      question(2, "Is there a transcript for this lesson? The audio cuts out around 4:10.")
    );
  } else if (me.role === UserRole.Instructor) {
    jobs.push(
      question(0, "Why do we need `as const` here? Wouldn't a plain object literal infer the same type?"),
      question(1, "Is there a transcript for this lesson?"),
      reply(2, "Thanks, that cleared it up!")
    );
  } else {
    jobs.push(
      reply(0, "You need to narrow the union first, try an `in` check before reading the property."),
      reply(1, "Same thing happened to me. Restarting the TS server fixed it."),
      send("refund-approved", null, {
        subject: course.title,
        excerpt: "Approved. Sorry it wasn't the right fit.",
        url: `/courses/${course.slug}`,
      })
    );
  }
  if (opts.isTeamAdmin) {
    jobs.push(
      send("seat-claimed", pick(3).id, {
        subject: course.title,
        seats_left: 3,
        url: "/team",
      })
    );
  }
  return Promise.all(jobs);
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
