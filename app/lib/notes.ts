import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

/**
 * The body of a Note as a Student submits it: plain text, trimmed, and
 * refused (never truncated) when it is empty or over the cap.
 */
export const noteBodySchema = z
  .string()
  .trim()
  .min(1, "Write something before saving your note.")
  .max(
    MAX_NOTE_LENGTH,
    `A note can be at most ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`
  );
