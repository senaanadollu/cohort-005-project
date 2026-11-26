import { AGENTS } from "./catalogue";
import type { RendererId } from "./types";

export type AgentSummary = {
  id: string;
  label: string;
  supported: boolean;
  /** True when the student must also be asked which model provider they use. */
  needsProvider: boolean;
  /** True when this agent has no catalogue provider: every setup is custom. */
  alwaysCustom: boolean;
};

export type ProviderSummary = {
  id: string;
  label: string;
};

/**
 * Every agent the wizard offers, in the order it offers them.
 *
 * The catalogue is written in order of popularity. The list is then sorted so
 * the agents that cannot be logged sit at the bottom, because a student picking
 * from the top should meet the ones that work first. The sort is stable, so
 * popularity still decides the order inside each group.
 */
export function listAgents(): AgentSummary[] {
  const summaries = AGENTS.map((agent) => ({
    id: agent.id,
    label: agent.label,
    supported: agent.providers != null,
    // An alwaysCustom agent never shows the provider question — askChoice
    // skips straight past it (see agent.alwaysCustom above) — regardless of
    // how many internal templates its catalogue entry holds for
    // findCustomTemplate to pick between. Junie is the first alwaysCustom
    // agent with more than one, so this used to be true by coincidence for
    // every alwaysCustom agent (OMP has exactly one provider); it is
    // spelled out here now that a second one exists.
    needsProvider: !agent.alwaysCustom && (agent.providers?.length ?? 0) > 1,
    alwaysCustom: agent.alwaysCustom === true,
  }));
  return [
    ...summaries.filter((agent) => agent.supported),
    ...summaries.filter((agent) => !agent.supported),
  ];
}

/**
 * The providers to ask about for one agent, when there is more than one to
 * choose between. Empty when there is nothing to ask — a refused agent has
 * none, and an agent with exactly one provider is assumed rather than asked.
 *
 * This stays gated at two on purpose, unchanged by the custom-base-url
 * mechanism: it describes the catalogue, not the wizard's options. See
 * agentProviders for the list config.ts actually builds the provider
 * question's options from, which is not gated this way.
 */
export function listProviders(agentId: string): ProviderSummary[] {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent?.providers || agent.providers.length < 2) return [];
  return agent.providers.map((p) => ({ id: p.id, label: p.label }));
}

/**
 * Every catalogue provider for one agent, regardless of how many there are.
 *
 * config.ts uses this, not listProviders, to build the provider question's
 * options — because "Custom base URL" is now offered at that question for
 * every supported agent, even one with a single catalogue provider, there is
 * always something to pick between even when listProviders would say there
 * is nothing to ask about.
 */
export function agentProviders(agentId: string): ProviderSummary[] {
  const agent = AGENTS.find((a) => a.id === agentId);
  return (agent?.providers ?? []).map((p) => ({ id: p.id, label: p.label }));
}

// ---------------------------------------------------------------------------
// Which requests are worth writing down
// ---------------------------------------------------------------------------

/**
 * Some calls reach the model provider but never produce a model reply. One turn
 * fires several of them, so they are noise for "what is sent to the model". The
 * proxy forwards them all. It only writes down the ones this returns true for.
 *
 *  - A model call is always a POST. Agents also send connectivity probes, which
 *    would otherwise write an empty document at the top of the logs folder.
 *  - The direct Anthropic API counts tokens with a `count_tokens` path.
 *    Claude Code on Vertex AI reaches the same Anthropic wire format through a
 *    Vertex-style URL instead, whose token-counting call ends
 *    `:countTokens` — Vertex's own camelCase, colon-suffixed convention,
 *    not Anthropic's underscored one — so both spellings are matched below.
 *  - Gemini counts tokens under a different name, and on the Google login route
 *    it fires several calls that carry no prompt at all. On that route the only
 *    calls worth keeping are the ones that generate content.
 */
export function shouldLogRequest(
  method: string,
  reqPath: string,
  renderer: RendererId
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  // Case-insensitive on purpose: the streaming call is `:streamGenerateContent`,
  // with a capital G, and the non-streaming one is `:generateContent`.
  if (renderer === "gemini") return /generateContent/i.test(reqPath);
  // Matches both `count_tokens` (direct Anthropic API) and `countTokens`
  // (Claude Code on Vertex AI).
  return !/count[_-]?tokens/i.test(reqPath);
}
