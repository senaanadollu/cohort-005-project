import { data } from "react-router";
import { parseFormData } from "~/lib/validation";
import type { Db } from "./db";
import { courseEditorActionSchema } from "./action-schema";
import {
  updateCourse,
  updateCoursePppEnabled,
  updateCoursePrice,
  updateCourseSalesCopy,
  updateCourseStatus,
} from "./course-settings";
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  getLessonById,
  getModuleById,
  moveLessonToModule,
  reorderLessons,
  reorderModules,
  updateLessonTitle,
  updateModuleTitle,
} from "./curriculum";

/** The course being edited, as the permission check resolved it. */
export type EditedCourse = { id: number; title: string; description: string };

/**
 * Applies one course editor form submission. The caller has already checked
 * that the Person may manage `course`.
 */
export function runCourseEditorAction(
  database: Db,
  course: EditedCourse,
  formData: FormData
) {
  const courseId = course.id;
  const parsed = parseFormData(formData, courseEditorActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { intent } = parsed.data;

  if (intent === "update-title") {
    updateCourse(database, courseId, parsed.data.title, course.description);
    return { success: true, field: "title" };
  }

  if (intent === "update-description") {
    updateCourse(database, courseId, course.title, parsed.data.description);
    return { success: true, field: "description" };
  }

  if (intent === "update-status") {
    updateCourseStatus(database, courseId, parsed.data.status);
    return { success: true, field: "status" };
  }

  if (intent === "update-price") {
    const priceDollars = parseFloat(parsed.data.price);
    if (isNaN(priceDollars) || priceDollars < 0) {
      return data(
        { error: "Price must be a non-negative number." },
        { status: 400 }
      );
    }
    if (priceDollars > 9999.99) {
      return data({ error: "Price cannot exceed $9,999.99." }, { status: 400 });
    }
    const priceCents = Math.round(priceDollars * 100);
    updateCoursePrice(database, courseId, priceCents);
    return { success: true, field: "price" };
  }

  if (intent === "update-ppp-enabled") {
    const pppEnabled = parsed.data.pppEnabled === "true";
    updateCoursePppEnabled(database, courseId, pppEnabled);
    return { success: true, field: "ppp-enabled" };
  }

  if (intent === "add-module") {
    createModule(database, courseId, parsed.data.title, null);
    return { success: true, field: "module" };
  }

  if (intent === "rename-module") {
    const { moduleId, title } = parsed.data;
    const mod = getModuleById(database, moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    updateModuleTitle(database, moduleId, title);
    return { success: true, field: "module" };
  }

  if (intent === "delete-module") {
    const { moduleId } = parsed.data;
    const mod = getModuleById(database, moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    deleteModule(database, moduleId);
    return { success: true, field: "module" };
  }

  if (intent === "add-lesson") {
    const { moduleId, title } = parsed.data;
    const mod = getModuleById(database, moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    createLesson(database, moduleId, title, null, null, null, null);
    return { success: true, field: "lesson" };
  }

  if (intent === "rename-lesson") {
    const { lessonId, title } = parsed.data;
    const lesson = getLessonById(database, lessonId);
    if (!lesson) {
      return data({ error: "Lesson not found." }, { status: 404 });
    }
    const mod = getModuleById(database, lesson.moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Lesson not found in this course." },
        { status: 404 }
      );
    }
    updateLessonTitle(database, lessonId, title);
    return { success: true, field: "lesson" };
  }

  if (intent === "reorder-modules") {
    const moduleIds: number[] = JSON.parse(parsed.data.moduleIds);
    reorderModules(database, courseId, moduleIds);
    return { success: true, field: "module-reorder" };
  }

  if (intent === "reorder-lessons") {
    const { moduleId, lessonIds: lessonIdsJson } = parsed.data;
    const mod = getModuleById(database, moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Module not found in this course." },
        { status: 404 }
      );
    }
    const lessonIds: number[] = JSON.parse(lessonIdsJson);
    reorderLessons(database, moduleId, lessonIds);
    return { success: true, field: "lesson-reorder" };
  }

  if (intent === "move-lesson") {
    const { lessonId, targetModuleId, targetPosition } = parsed.data;
    const lesson = getLessonById(database, lessonId);
    if (!lesson) {
      return data({ error: "Lesson not found." }, { status: 404 });
    }
    const sourceMod = getModuleById(database, lesson.moduleId);
    if (!sourceMod || sourceMod.courseId !== courseId) {
      return data(
        { error: "Lesson not found in this course." },
        { status: 404 }
      );
    }
    const targetMod = getModuleById(database, targetModuleId);
    if (!targetMod || targetMod.courseId !== courseId) {
      return data(
        { error: "Target module not found in this course." },
        { status: 404 }
      );
    }
    moveLessonToModule(database, lessonId, targetModuleId, targetPosition);
    return { success: true, field: "lesson-move" };
  }

  if (intent === "delete-lesson") {
    const { lessonId } = parsed.data;
    const lesson = getLessonById(database, lessonId);
    if (!lesson) {
      return data({ error: "Lesson not found." }, { status: 404 });
    }
    const mod = getModuleById(database, lesson.moduleId);
    if (!mod || mod.courseId !== courseId) {
      return data(
        { error: "Lesson not found in this course." },
        { status: 404 }
      );
    }
    deleteLesson(database, lessonId);
    return { success: true, field: "lesson" };
  }

  if (intent === "update-sales-copy") {
    updateCourseSalesCopy(database, courseId, parsed.data.salesCopy);
    return { success: true, field: "sales-copy" };
  }

  throw data("Invalid action.", { status: 400 });
}
