/**
 * The catalogue itself: one entry per agent, each in its own file under
 * ./catalogue/. This file only fixes the order.
 */
import type { AgentEntry } from "./types";
import { CLAUDE_CODE } from "./catalogue/claude-code";
import { CODEX } from "./catalogue/codex";
import { COPILOT } from "./catalogue/copilot";
import { AMP, CURSOR } from "./catalogue/refused";
import { OPENCODE } from "./catalogue/opencode";
import { PI } from "./catalogue/pi";
import { OMP } from "./catalogue/omp";
import { GEMINI } from "./catalogue/gemini";
import { ANTIGRAVITY } from "./catalogue/antigravity";
import { JUNIE } from "./catalogue/junie";

/**
 * Ordered by popularity, decided 2026-08-06. The wizard shows them in this
 * order, so a student is most likely to find theirs first.
 */
export const AGENTS: AgentEntry[] = [
  CLAUDE_CODE,
  CODEX,
  COPILOT,
  CURSOR,
  OPENCODE,
  PI,
  OMP,
  GEMINI,
  ANTIGRAVITY,
  JUNIE,
  AMP,
];
