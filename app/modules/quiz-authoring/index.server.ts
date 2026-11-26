import { db } from "~/db";

import { handleQuizAction } from "./lib/quiz-action";
import {
  type Db,
  getLessonById,
  getModuleById,
  getQuizByLessonId,
  getQuizWithQuestions,
} from "./lib/quiz-store";

/**
 * The quiz authoring entry point bound to a database: what the instructor's
 * quiz builder reads and writes. The app uses `quizAuthoring`, which reads the
 * app database. Permission checks stay with the caller (see
 * `~/modules/permissions/course-permissions.server`).
 */
export function createQuizAuthoring(database: Db) {
  return {
    /**
     * The lesson, its module and the lesson's quiz (with questions and
     * options) if it has one. `null` when the lesson or its module is missing.
     */
    getQuizEditor(lessonId: number) {
      const lesson = getLessonById(database, lessonId);
      const mod = lesson && getModuleById(database, lesson.moduleId);
      if (!lesson || !mod) return null;

      // Load existing quiz if present
      const existingQuizBasic = getQuizByLessonId(database, lesson.id);
      const existingQuiz = existingQuizBasic
        ? getQuizWithQuestions(database, existingQuizBasic.id)
        : null;

      return { lesson, module: mod, existingQuiz };
    },

    /**
     * Runs the quiz builder's form post: `save-quiz` replaces the lesson's
     * quiz with the posted wizard data, `delete-quiz` removes it. Returns a
     * 400 `{ error }` for invalid input.
     */
    handleAction(lessonId: number, formData: FormData) {
      return handleQuizAction(database, lessonId, formData);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const quizAuthoring = /* @__PURE__ */ createQuizAuthoring(db);
