import { data } from "react-router";
import { z } from "zod";

import { QuestionType } from "~/db/schema";
import { parseFormData } from "~/lib/validation";

import {
  createOption,
  createQuestion,
  createQuiz,
  type Db,
  deleteQuiz,
  getQuizByLessonId,
} from "./quiz-store";

const wizardDataSchema = z.object({
  title: z.string().trim().min(1, "Quiz title is required."),
  passingScore: z.number(),
  questions: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        type: z.nativeEnum(QuestionType),
        options: z.array(
          z.object({
            id: z.string(),
            text: z.string(),
            isCorrect: z.boolean(),
          })
        ),
      })
    )
    .min(1, "At least one question is required."),
});

const quizActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("save-quiz"),
    wizardData: z.string(),
  }),
  z.object({
    intent: z.literal("delete-quiz"),
  }),
]);

/**
 * Parses the quiz builder's form post and runs its intent. The caller has
 * already checked the Person may manage the course and that the lesson is in
 * it.
 */
export function handleQuizAction(db: Db, lessonId: number, formData: FormData) {
  const parsed = parseFormData(formData, quizActionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { intent } = parsed.data;

  if (intent === "save-quiz") {
    return saveQuiz(db, lessonId, parsed.data.wizardData);
  }

  if (intent === "delete-quiz") {
    const existingQuiz = getQuizByLessonId(db, lessonId);
    if (existingQuiz) {
      deleteQuiz(db, existingQuiz.id);
    }
    return { success: true, deleted: true };
  }

  throw data("Invalid action.", { status: 400 });
}

function saveQuiz(db: Db, lessonId: number, rawWizardData: string) {
  let wizardData: z.infer<typeof wizardDataSchema>;
  try {
    const raw = JSON.parse(rawWizardData);
    const wizardResult = wizardDataSchema.safeParse(raw);
    if (!wizardResult.success) {
      return data({ error: "Invalid quiz data." }, { status: 400 });
    }
    wizardData = wizardResult.data;
  } catch {
    return data({ error: "Invalid quiz data." }, { status: 400 });
  }

  // Delete existing quiz if present
  const existingQuiz = getQuizByLessonId(db, lessonId);
  if (existingQuiz) {
    deleteQuiz(db, existingQuiz.id);
  }

  // Create the quiz
  const quiz = createQuiz(
    db,
    lessonId,
    wizardData.title.trim(),
    wizardData.passingScore / 100
  );

  // Create questions and options
  for (let qi = 0; qi < wizardData.questions.length; qi++) {
    const q = wizardData.questions[qi];
    const question = createQuestion(db, quiz.id, q.text.trim(), q.type, qi + 1);

    for (const opt of q.options) {
      createOption(db, question.id, opt.text.trim(), opt.isCorrect);
    }
  }

  return { success: true };
}
