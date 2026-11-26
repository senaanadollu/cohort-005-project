import { describe, it, expect, beforeEach } from "vitest";
import {
  addLesson,
  addModule,
  addQuiz,
  addUser,
  asInstructor,
  attempt,
  course,
  setUpAnalyticsFixtures,
} from "./fixtures";

beforeEach(setUpAnalyticsFixtures);

describe("quiz pass rates", () => {
  let lesson1: number;
  let lesson3: number;

  beforeEach(() => {
    const first = addModule(course.id, "Basics", 1);
    const second = addModule(course.id, "Advanced", 2);
    lesson1 = addLesson(first.id, "Lesson 1", 1).id;
    lesson3 = addLesson(second.id, "Lesson 3", 1).id;
  });

  function quizzes(params: Record<string, string> = {}) {
    return asInstructor({ course: String(course.id), ...params }).quizzes;
  }

  it("judges each student by their best attempt", () => {
    const quiz = addQuiz(lesson1, "Basics Quiz", 0.7);
    const improver = addUser("Improver");
    const struggler = addUser("Struggler");
    attempt(improver.id, quiz.id, 0.5, false);
    attempt(improver.id, quiz.id, 0.9, true);
    attempt(struggler.id, quiz.id, 0.6, false);

    expect(quizzes()).toEqual([
      {
        quizId: quiz.id,
        title: "Basics Quiz",
        moduleTitle: "Basics",
        lessonTitle: "Lesson 1",
        passingScorePercent: 70,
        studentCount: 2,
        passedCount: 1,
        passRatePercent: 50,
        averageBestScorePercent: 75,
      },
    ]);
  });

  it("trusts the verdict recorded on the best attempt", () => {
    // Failed under an older, stricter pass mark; not re-judged now.
    const quiz = addQuiz(lesson1, "Basics Quiz", 0.7);
    attempt(addUser("Student").id, quiz.id, 0.72, false);

    expect(quizzes()?.[0]).toMatchObject({
      passedCount: 0,
      passRatePercent: 0,
    });
  });

  it("lists quizzes in curriculum order, including unattempted ones", () => {
    const later = addQuiz(lesson3, "Advanced Quiz", 0.8);
    const earlier = addQuiz(lesson1, "Basics Quiz", 0.7);

    expect(quizzes()?.map((quiz) => quiz.quizId)).toEqual([
      earlier.id,
      later.id,
    ]);
    expect(quizzes()?.[1]).toMatchObject({
      studentCount: 0,
      passedCount: 0,
      passRatePercent: null,
      averageBestScorePercent: null,
    });
  });

  it("only counts attempts inside the range", () => {
    const quiz = addQuiz(lesson3, "Advanced Quiz", 0.8);
    attempt(addUser("Student").id, quiz.id, 0.85, true, 40);

    expect(quizzes({ range: "30d" })?.[0].studentCount).toBe(0);
    expect(quizzes({ range: "all" })?.[0]).toMatchObject({
      studentCount: 1,
      passRatePercent: 100,
      averageBestScorePercent: 85,
    });
  });

  it("is empty for a course without quizzes", () => {
    expect(quizzes()).toEqual([]);
  });
});
