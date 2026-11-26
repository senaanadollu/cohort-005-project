import { db } from "~/db";

import type { Db } from "./lib/db";
import { type EditedCourse, runCourseEditorAction } from "./lib/editor-actions";
import { getCourseEditorData } from "./lib/editor-data";

export type { CourseEditorData } from "./lib/editor-data";
export type { EditedCourse } from "./lib/editor-actions";

/**
 * The instructor course editor bound to a database. The app uses
 * `courseEditor`, which reads the app database; tests build their own
 * against a test database. Neither function checks permissions: the caller
 * must already know the Person may manage the course.
 */
export function createCourseEditor(database: Db) {
  return {
    /**
     * The course with its modules and lessons, its lesson and enrollment
     * counts, and the student roster. Null when the course doesn't exist.
     */
    load(courseId: number) {
      return getCourseEditorData(database, courseId);
    },

    /**
     * Validates and applies one editor form submission (title, description,
     * status, price, PPP, sales copy, and module and lesson add, rename,
     * delete, reorder and move). Returns `{ success, field }`, or a 400/404
     * `data({ error })` response. Throws a 400 for an unknown intent.
     */
    act(course: EditedCourse, formData: FormData) {
      return runCourseEditorAction(database, course, formData);
    },
  };
}

// Pure so a route importing this only for its loader and action doesn't pull
// the database into the client bundle (see `~/db`).
export const courseEditor = /* @__PURE__ */ createCourseEditor(db);
