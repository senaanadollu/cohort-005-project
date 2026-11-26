import type { CourseEditorData } from "~/modules/course-editor/index.server";

/** The course as the editor page loads it, with its modules and lessons. */
export type EditorCourse = CourseEditorData["course"];

/** One row of the Students tab. */
export type RosterStudent = CourseEditorData["students"][number];
