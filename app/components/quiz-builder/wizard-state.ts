import type { Dispatch, SetStateAction } from "react";

import type { QuestionType } from "~/db/schema";

// ─── Types for wizard state ───

export type WizardOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

export type WizardQuestion = {
  id: string;
  text: string;
  type: QuestionType;
  options: WizardOption[];
};

export type WizardState = {
  title: string;
  passingScore: number;
  questions: WizardQuestion[];
};

/** Props shared by the wizard steps that edit the wizard state. */
export type WizardStepProps = {
  wizard: WizardState;
  setWizard: Dispatch<SetStateAction<WizardState>>;
};

export function generateId() {
  return Math.random().toString(36).slice(2, 10);
}
