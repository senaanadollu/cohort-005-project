/**
 * agents.ts — the catalogue of coding agents the request-logger can proxy.
 *
 * This module is the single source of truth for every per-agent fact:
 *  - which upstream host that agent's traffic must go to,
 *  - which renderer reads that wire format,
 *  - the exact command to run, correct by construction.
 *
 * Nothing else in the tool decides these things. The wizard reads the catalogue
 * to build its questions, the proxy reads the resolved target to route and to
 * render, and the startup banner prints the resolved command. Because the facts
 * are data rather than prose, they can be tested — and they cannot silently rot
 * the way a README does.
 *
 * Adding an eighth agent should be one entry here and nothing else.
 *
 * Not every student's setup fits a catalogue entry, though — a local model
 * server or a small provider has no fixed host to hard-code. For those, the
 * wizard offers "Custom base URL" wherever it offers a provider, and builds a
 * CustomTarget from what the student types instead of looking one up. See
 * resolveCustomTarget in ./agents/custom-target.ts.
 *
 * The implementation lives in ./agents/: types.ts (shapes and wizard
 * constants), catalogue.ts + catalogue/ (one file per agent), reading.ts
 * (listing and which requests to log), command.ts (shell quoting),
 * custom-target.ts (the custom-base-url path) and resolve.ts (resolveChoice).
 * This file is the single public entry point that re-exports them.
 */

export * from "./agents/types";
export * from "./agents/reading";
export { customTargetNeedsModel } from "./agents/custom-target";
export { resolveChoice } from "./agents/resolve";
