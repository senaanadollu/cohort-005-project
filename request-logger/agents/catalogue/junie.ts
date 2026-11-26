import { junieConfig } from "../setup-files";
import type { AgentEntry } from "../types";

const JUNIE_NOTE =
  "Junie has no existing login for this tool to pass through the way Claude " +
  "Code or Codex do. Its custom proxy bypasses JetBrains AI authentication " +
  "entirely, so a real API key for whichever backend you are logging goes " +
  "straight into config.json's headers array in plaintext. Do not commit " +
  "this file.";

const JUNIE_MERGE_NOTE =
  "This is merged into ~/.junie/config.json, not a replacement for it — add " +
  "the proxies entry and the provider key alongside whatever else is " +
  "already in that file.";

export const JUNIE: AgentEntry = {
  id: "junie",
  label: "Junie",
  // Junie is BYOK across several backends (OpenAI, Anthropic, Google, xAI,
  // OpenRouter, Copilot, a LiteLLM proxy) with no single fixed host of its
  // own — the same shape as OMP — so every setup for it is custom too. See
  // AgentEntry.alwaysCustom.
  //
  // Junie CLI is closed source, so unlike every other entry in this
  // catalogue this one is verified against JetBrains' published docs only,
  // not against real source or a real install. Testing status is recorded
  // in the README's "How much this was tested" section, the same way every
  // other agent's is; it is not printed to the student, the same way no
  // other agent's is either.
  alwaysCustom: true,
  providers: [
    {
      id: "anthropic",
      label: "Anthropic-compatible",
      // Unused: Junie never reaches the normal (non-custom) resolution
      // path that would read this. See resolveCustomTarget.
      upstreamHost: "",
      renderer: "raw",
      bin: "junie",
      customTemplateFor: ["anthropic"],
      setup: [
        junieConfig(
          "{baseUrl}",
          "Anthropic",
          "x-api-key: YOUR_ANTHROPIC_API_KEY"
        ),
      ],
      notes: [JUNIE_NOTE, JUNIE_MERGE_NOTE],
    },
    {
      id: "openai",
      label: "OpenAI-compatible",
      // Unused, same as the Anthropic-compatible entry above: Junie never
      // reaches the normal (non-custom) resolution path that would read
      // this. See resolveCustomTarget.
      upstreamHost: "",
      renderer: "raw",
      bin: "junie",
      // Also the catch-all for "raw"/not sure — see the OpenCode and Pi
      // entries above for why an OpenAI-compatible guess is the better
      // default for an unidentified custom server.
      customTemplateFor: ["openai", "raw"],
      setup: [
        junieConfig(
          "{baseUrl}",
          "OpenAI",
          "Authorization: Bearer YOUR_OPENAI_API_KEY"
        ),
      ],
      notes: [JUNIE_NOTE, JUNIE_MERGE_NOTE],
    },
  ],
};
