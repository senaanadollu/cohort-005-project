import type { AgentChoice, ProviderEntry, Resolution } from "./types";
import { CUSTOM_ID, ISSUE_URL, OTHER_ID } from "./types";
import { AGENTS } from "./catalogue";
import { buildCommand } from "./command";
import { resolveCustomTarget } from "./custom-target";

/**
 * Turn a saved choice into everything the tool needs, or into a clear reason
 * why it cannot.
 *
 * Pure: no disk, no network, no clock. Give it the same choice, the same
 * port and the same platform and it gives back the same answer. `platform`
 * decides only the shell syntax of the printed command — POSIX `KEY=value
 * bin` everywhere except win32, where PowerShell needs `$env:KEY = 'value'`
 * statements instead (see withEnv). The caller reads `process.platform`
 * once and passes it in, the same way it already does for `port`.
 */
export function resolveChoice(
  choice: AgentChoice,
  options: { port: number; platform: NodeJS.Platform }
): Resolution {
  const agent = AGENTS.find((a) => a.id === choice.agent);

  // "Other" at either question means the same thing: the catalogue has no entry
  // for this student. Checked before the agent lookup, because "other" is not
  // an agent and must not read as an unknown one.
  if (choice.agent === OTHER_ID || choice.provider === OTHER_ID) {
    return {
      kind: "request",
      agentLabel: agent?.label ?? null,
      url: ISSUE_URL,
    };
  }

  if (!agent) {
    return {
      kind: "error",
      message:
        `Unknown agent "${choice.agent}". Run with --force to choose again. ` +
        `Known agents: ${AGENTS.map((a) => a.id).join(", ")}.`,
    };
  }

  if (!agent.providers) {
    return {
      kind: "refusal",
      agent: agent.id,
      agentLabel: agent.label,
      reason: agent.reason ?? "This agent cannot be logged.",
    };
  }

  // A custom target is resolved from what the student typed, not from a
  // catalogue lookup — either because they chose "Custom base URL" at the
  // provider question, or because every setup for this agent is custom
  // (alwaysCustom, e.g. OMP), which never shows that question at all.
  if (agent.alwaysCustom || choice.provider === CUSTOM_ID) {
    return resolveCustomTarget(agent, choice, options.port, options.platform);
  }

  let provider: ProviderEntry | undefined;
  if (agent.providers.length === 1) {
    // One provider, so the wizard never asked. Ignore anything saved.
    provider = agent.providers[0];
  } else if (choice.provider == null) {
    return {
      kind: "error",
      message:
        `${agent.label} can drive more than one model provider, so a provider ` +
        `must be chosen. Run with --force to choose again. Providers: ` +
        `${agent.providers.map((p) => p.id).join(", ")}.`,
    };
  } else {
    provider = agent.providers.find((p) => p.id === choice.provider);
    if (!provider) {
      return {
        kind: "error",
        message:
          `Unknown provider "${choice.provider}" for ${agent.label}. Run with ` +
          `--force to choose again. Providers: ` +
          `${agent.providers.map((p) => p.id).join(", ")}.`,
      };
    }
  }

  const baseUrl = `http://localhost:${options.port}${provider.suffix ?? ""}`;

  return {
    kind: "target",
    agent: agent.id,
    agentLabel: agent.label,
    provider: provider.id,
    providerLabel: provider.label,
    upstreamHost: provider.upstreamHost,
    renderer: provider.renderer,
    baseUrl,
    command: buildCommand(provider, baseUrl, options.platform),
    setup: (provider.setup ?? []).map((file) => ({
      ...file,
      body: file.body.replace(/\{baseUrl\}/g, baseUrl),
    })),
    notes: provider.notes ?? [],
    warnings: provider.warnings ?? [],
  };
}
