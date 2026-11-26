import { eq, and, or, sql, desc } from "drizzle-orm";
import {
  users,
  modules,
  lessons,
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  quizzes,
  quizAttempts,
} from "~/db/schema";
import type { Db } from "./db";

function getUserById(database: Db, id: number) {
  return database.select().from(users).where(eq(users.id, id)).get();
}

function getCourseEnrolledStudents(database: Db, courseId: number) {
  return database
    .select({
      enrollmentId: enrollments.id,
      userId: enrollments.userId,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .where(eq(enrollments.courseId, courseId))
    .all();
}

function getCourseLessonIds(database: Db, courseId: number): number[] {
  const courseModules = database
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .all();

  if (courseModules.length === 0) return [];

  const courseLessons = database
    .select({ id: lessons.id })
    .from(lessons)
    .where(or(...courseModules.map((m) => eq(lessons.moduleId, m.id)))!)
    .all();

  return courseLessons.map((l) => l.id);
}

function calculateProgress(
  database: Db,
  userId: number,
  courseId: number,
  weightByDuration: boolean
) {
  const lessonIds = getCourseLessonIds(database, courseId);

  if (lessonIds.length === 0) return 0;

  if (weightByDuration) {
    const courseLessons = database
      .select({
        id: lessons.id,
        durationMinutes: lessons.durationMinutes,
      })
      .from(lessons)
      .where(or(...lessonIds.map((id) => eq(lessons.id, id)))!)
      .all();

    const totalDuration = courseLessons.reduce(
      (sum, l) => sum + (l.durationMinutes ?? 1),
      0
    );

    if (totalDuration === 0) return 0;

    const completed = database
      .select()
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, LessonProgressStatus.Completed),
          or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
        )
      )
      .all();

    const completedIds = new Set(completed.map((p) => p.lessonId));

    const completedDuration = courseLessons
      .filter((l) => completedIds.has(l.id))
      .reduce((sum, l) => sum + (l.durationMinutes ?? 1), 0);

    return Math.round((completedDuration / totalDuration) * 100);
  }

  const completedCount = database
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        or(...lessonIds.map((id) => eq(lessonProgress.lessonId, id)))!
      )
    )
    .get();

  return Math.round(((completedCount?.count ?? 0) / lessonIds.length) * 100);
}

function getQuizByLessonId(database: Db, lessonId: number) {
  return database
    .select()
    .from(quizzes)
    .where(eq(quizzes.lessonId, lessonId))
    .get();
}

function getBestAttempt(database: Db, userId: number, quizId: number) {
  return database
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

/**
 * The students tab: every enrolled student with their progress and best
 * score on each quiz in the course, plus how many lessons have a quiz.
 */
export function getStudentRoster(
  database: Db,
  courseId: number,
  allCourseLessons: { id: number; title: string }[]
) {
  // Student roster data
  const enrolledStudents = getCourseEnrolledStudents(database, courseId);

  // Gather all lessons from the course modules and find which have quizzes
  const lessonQuizzes: {
    lessonId: number;
    lessonTitle: string;
    quizId: number;
    quizTitle: string;
  }[] = [];
  for (const lesson of allCourseLessons) {
    const quiz = getQuizByLessonId(database, lesson.id);
    if (quiz) {
      lessonQuizzes.push({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        quizId: quiz.id,
        quizTitle: quiz.title,
      });
    }
  }

  const students = enrolledStudents.map((enrollment) => {
    const studentUser = getUserById(database, enrollment.userId);
    const progress = calculateProgress(
      database,
      enrollment.userId,
      courseId,
      false
    );

    const quizScores = lessonQuizzes.map((lq) => {
      const bestAttempt = getBestAttempt(
        database,
        enrollment.userId,
        lq.quizId
      );
      return {
        quizId: lq.quizId,
        quizTitle: lq.quizTitle,
        lessonTitle: lq.lessonTitle,
        bestScore: bestAttempt?.score ?? null,
        passed: bestAttempt?.passed ?? null,
      };
    });

    return {
      userId: enrollment.userId,
      name: studentUser?.name ?? "Unknown",
      email: studentUser?.email ?? "",
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      progress,
      quizScores,
    };
  });

  const quizCount = lessonQuizzes.length;

  return { students, quizCount };
}
