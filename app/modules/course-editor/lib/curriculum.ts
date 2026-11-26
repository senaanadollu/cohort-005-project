import { and, eq, gt, gte, sql } from "drizzle-orm";

import { lessons, modules } from "~/db/schema";
import { markdown } from "~/lib/text";

import type { Db } from "./db";

export function getModuleById(database: Db, id: number) {
  return database.select().from(modules).where(eq(modules.id, id)).get();
}

function getModulesByCourse(database: Db, courseId: number) {
  return database
    .select()
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position)
    .all();
}

export function createModule(
  database: Db,
  courseId: number,
  title: string,
  position: number | null
) {
  const pos =
    position ??
    database
      .select({ max: sql<number>`coalesce(max(${modules.position}), 0)` })
      .from(modules)
      .where(eq(modules.courseId, courseId))
      .get()!.max + 1;

  return database
    .insert(modules)
    .values({ courseId, title, position: pos })
    .returning()
    .get();
}

export function updateModuleTitle(database: Db, id: number, title: string) {
  return database
    .update(modules)
    .set({ title })
    .where(eq(modules.id, id))
    .returning()
    .get();
}

export function deleteModule(database: Db, id: number) {
  // Delete all lessons in this module first
  database.delete(lessons).where(eq(lessons.moduleId, id)).run();
  return database.delete(modules).where(eq(modules.id, id)).returning().get();
}

export function reorderModules(
  database: Db,
  courseId: number,
  moduleIds: number[]
) {
  for (let i = 0; i < moduleIds.length; i++) {
    database
      .update(modules)
      .set({ position: i + 1 })
      .where(and(eq(modules.id, moduleIds[i]), eq(modules.courseId, courseId)))
      .run();
  }
  return getModulesByCourse(database, courseId);
}

export function getLessonById(database: Db, id: number) {
  return database.select().from(lessons).where(eq(lessons.id, id)).get();
}

function getLessonsByModule(database: Db, moduleId: number) {
  return database
    .select()
    .from(lessons)
    .where(eq(lessons.moduleId, moduleId))
    .orderBy(lessons.position)
    .all();
}

export function createLesson(
  database: Db,
  moduleId: number,
  title: string,
  content: string | null,
  videoUrl: string | null,
  position: number | null,
  durationMinutes: number | null
) {
  const pos =
    position ??
    database
      .select({ max: sql<number>`coalesce(max(${lessons.position}), 0)` })
      .from(lessons)
      .where(eq(lessons.moduleId, moduleId))
      .get()!.max + 1;

  return database
    .insert(lessons)
    .values({
      moduleId,
      title,
      content: content === null ? null : markdown(content),
      videoUrl,
      position: pos,
      durationMinutes,
    })
    .returning()
    .get();
}

export function updateLessonTitle(database: Db, id: number, title: string) {
  return database
    .update(lessons)
    .set({ title })
    .where(eq(lessons.id, id))
    .returning()
    .get();
}

export function deleteLesson(database: Db, id: number) {
  return database.delete(lessons).where(eq(lessons.id, id)).returning().get();
}

export function reorderLessons(
  database: Db,
  moduleId: number,
  lessonIds: number[]
) {
  for (let i = 0; i < lessonIds.length; i++) {
    database
      .update(lessons)
      .set({ position: i + 1 })
      .where(and(eq(lessons.id, lessonIds[i]), eq(lessons.moduleId, moduleId)))
      .run();
  }
  return getLessonsByModule(database, moduleId);
}

export function moveLessonToModule(
  database: Db,
  lessonId: number,
  targetModuleId: number,
  targetPosition: number
) {
  const lesson = getLessonById(database, lessonId);
  if (!lesson) return null;

  const sourceModuleId = lesson.moduleId;

  // 1. Close the gap in the source module
  database
    .update(lessons)
    .set({ position: sql`${lessons.position} - 1` })
    .where(
      and(
        eq(lessons.moduleId, sourceModuleId),
        gt(lessons.position, lesson.position)
      )
    )
    .run();

  // 2. Open a gap in the destination module
  database
    .update(lessons)
    .set({ position: sql`${lessons.position} + 1` })
    .where(
      and(
        eq(lessons.moduleId, targetModuleId),
        gte(lessons.position, targetPosition)
      )
    )
    .run();

  // 3. Move the lesson to the target module at the target position
  return database
    .update(lessons)
    .set({ moduleId: targetModuleId, position: targetPosition })
    .where(eq(lessons.id, lessonId))
    .returning()
    .get();
}
