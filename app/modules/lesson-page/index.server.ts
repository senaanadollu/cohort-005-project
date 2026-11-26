import { loadLessonPage } from "./lib/load-lesson-page";
import { handleLessonAction } from "./lib/lesson-action";

/**
 * The lesson page: everything the lesson route loads and every intent it
 * accepts. Both check course permissions themselves and throw responses
 * (404, 400, 500) the route lets bubble.
 */
export const lessonPage = {
  /**
   * The lesson as the current Person may see it: `view: "locked"` with only
   * the outline and the denial reason, or `view: "full"` with the content,
   * progress, quiz, Discussion, Bookmark and Note. Viewing marks the lesson
   * in progress for people who can take the course.
   */
  load: loadLessonPage,
  /**
   * Handles one posted intent: create-comment, edit-comment, delete-comment,
   * toggle-bookmark, save-note, mark-complete or submit-quiz.
   */
  act: handleLessonAction,
};

export type LessonPageData = Awaited<ReturnType<typeof loadLessonPage>>;
export type FullLessonData = Extract<LessonPageData, { view: "full" }>;
export type LockedLessonData = Extract<LessonPageData, { view: "locked" }>;
