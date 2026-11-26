import type * as schema from "../../app/db/schema";

export type SeedUser = typeof schema.users.$inferSelect;
export type SeedCategory = typeof schema.categories.$inferSelect;
export type SeedCourse = typeof schema.courses.$inferSelect;
export type SeedQuiz = typeof schema.quizzes.$inferSelect;

// The options of one quiz, flattened across its questions.
export type QuizOptionIds = {
  questionId: number;
  optionId: number;
  correct: boolean;
}[];

export type StudentByEmail = (email: string) => SeedUser;
