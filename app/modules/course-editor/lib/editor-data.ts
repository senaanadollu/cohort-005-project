import {
  getCourseWithDetails,
  getEnrollmentCountForCourse,
  getLessonCountForCourse,
} from "./course-details";
import type { Db } from "./db";
import { getStudentRoster } from "./student-roster";

/**
 * Everything the course editor page shows, or null when the course doesn't
 * exist. Nothing else is read when the course is missing.
 */
export function getCourseEditorData(database: Db, courseId: number) {
  const course = getCourseWithDetails(database, courseId);
  if (!course) return null;

  const lessonCount = getLessonCountForCourse(database, courseId);
  const enrollmentCount = getEnrollmentCountForCourse(database, courseId);

  const allCourseLessons = course.modules.flatMap((mod) => mod.lessons);
  const { students, quizCount } = getStudentRoster(
    database,
    courseId,
    allCourseLessons
  );

  return { course, lessonCount, enrollmentCount, students, quizCount };
}

export type CourseEditorData = NonNullable<
  ReturnType<typeof getCourseEditorData>
>;
