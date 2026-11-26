import { eq } from "drizzle-orm";

import { courses, CourseStatus } from "~/db/schema";
import { markdown } from "~/lib/text";

import type { Db } from "./db";

export function updateCourse(
  database: Db,
  id: number,
  title: string,
  description: string
) {
  return database
    .update(courses)
    .set({ title, description, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCourseStatus(
  database: Db,
  id: number,
  status: CourseStatus
) {
  return database
    .update(courses)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCourseSalesCopy(
  database: Db,
  id: number,
  salesCopy: string
) {
  if (salesCopy.trim().length === 0) {
    throw new Error("Sales copy cannot be empty");
  }

  return database
    .update(courses)
    .set({
      salesCopy: markdown(salesCopy),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCoursePrice(database: Db, id: number, price: number) {
  return database
    .update(courses)
    .set({ price, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}

export function updateCoursePppEnabled(
  database: Db,
  id: number,
  pppEnabled: boolean
) {
  return database
    .update(courses)
    .set({ pppEnabled, updatedAt: new Date().toISOString() })
    .where(eq(courses.id, id))
    .returning()
    .get();
}
