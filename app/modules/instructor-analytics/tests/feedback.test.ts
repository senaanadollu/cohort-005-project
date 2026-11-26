import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import {
  addLesson,
  addModule,
  addUser,
  admin,
  asAdmin,
  asInstructor,
  comment,
  course,
  instructor,
  otherCourse,
  otherInstructor,
  rate,
  setUpAnalyticsFixtures,
} from "./fixtures";

beforeEach(setUpAnalyticsFixtures);

describe("ratings", () => {
  it("averages ratings in the range to one decimal place", () => {
    rate(addUser("A").id, course.id, 5);
    rate(addUser("B").id, course.id, 4);
    rate(addUser("C").id, course.id, 4);
    rate(addUser("D").id, course.id, 1, 40);
    rate(addUser("E").id, otherCourse.id, 1);

    expect(asInstructor({ range: "30d" }).ratings).toEqual({
      average: 4.3,
      count: 3,
    });
  });

  it("has no average without ratings", () => {
    expect(asInstructor().ratings).toEqual({ average: null, count: 0 });
  });
});

describe("unanswered questions", () => {
  let lessonId: number;
  let student: typeof schema.users.$inferSelect;

  beforeEach(() => {
    const module = addModule(course.id, "Basics", 1);
    lessonId = addLesson(module.id, "Lesson 1", 1).id;
    student = addUser("Sam Student");
  });

  it("counts a student's question nobody has answered", () => {
    comment(lessonId, student.id);

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("does not count a question the course's instructor answered", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, instructor.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("does not count a question an admin answered", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, admin.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("still counts a question only another student answered", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, addUser("Helpful Peer").id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("still counts a question answered by an instructor of a different course", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, otherInstructor.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("still counts a question whose staff reply was deleted", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, instructor.id, { parentId: question.id, deleted: true });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("does not count a deleted question", () => {
    comment(lessonId, student.id, { deleted: true });

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("does not count questions staff asked", () => {
    comment(lessonId, instructor.id);
    comment(lessonId, admin.id);

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
  });

  it("does not count replies as questions", () => {
    const question = comment(lessonId, student.id);
    comment(lessonId, addUser("Helpful Peer").id, { parentId: question.id });
    comment(lessonId, student.id, { parentId: question.id });

    expect(asInstructor().questions).toEqual({ inRange: 1, older: 0 });
  });

  it("reports questions older than the range rather than dropping them", () => {
    comment(lessonId, student.id, { daysBack: 2 });
    comment(lessonId, student.id, { daysBack: 100 });

    expect(asInstructor({ range: "30d" }).questions).toEqual({
      inRange: 1,
      older: 1,
    });
    expect(asInstructor({ range: "all" }).questions).toEqual({
      inRange: 2,
      older: 0,
    });
  });

  it("ignores questions on another instructor's courses", () => {
    const otherModule = addModule(otherCourse.id, "Elsewhere", 1);
    comment(addLesson(otherModule.id, "Their lesson", 1).id, student.id);

    expect(asInstructor().questions).toEqual({ inRange: 0, older: 0 });
    expect(asAdmin().questions).toEqual({ inRange: 1, older: 0 });
  });
});
