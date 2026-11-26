import { describe, expect, it } from "vitest";

import { resolveChoice } from "../agents";
import { customTarget, PORT, target } from "./test-helpers";

describe("resolveChoice — Junie", () => {
  it("resolves Junie straight from a base URL and wire format, with no provider needed", () => {
    const result = resolveChoice(
      {
        agent: "junie",
        customBaseUrl: "http://localhost:8787",
        customRenderer: "anthropic",
      },
      PORT
    );
    expect(result.kind).toBe("custom-target");
  });

  it("gives Junie its own bin, with no env vars", () => {
    const result = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "anthropic",
    });
    expect(result.command).toBe("junie");
  });

  it("writes an Anthropic-kind proxy entry for the anthropic-compatible route", () => {
    const result = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "anthropic",
    });
    expect(result.setup).toHaveLength(1);
    expect(result.setup[0].path).toBe("~/.junie/config.json");
    expect(result.setup[0].language).toBe("json");
    expect(result.setup[0].body).toContain('"kind": "Anthropic"');
    expect(result.setup[0].body).toContain(
      '"api-url": "http://localhost:8787"'
    );
    expect(result.setup[0].body).toContain("x-api-key:");
    expect(result.setup[0].body).toContain('"provider": "request-logger"');
  });

  it("writes an OpenAI-kind proxy entry for the openai-compatible route", () => {
    const result = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "openai",
    });
    expect(result.setup[0].body).toContain('"kind": "OpenAI"');
    expect(result.setup[0].body).toContain("Authorization: Bearer");
  });

  it("defaults Junie's raw/not-sure custom target to the OpenAI-kind template", () => {
    // Same convention as OpenCode and Pi's custom targets: an unidentified
    // custom server is far more often OpenAI-compatible than
    // Anthropic-compatible.
    const result = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "raw",
    });
    expect(result.setup[0].body).toContain('"kind": "OpenAI"');
  });

  it("never sends Junie's Anthropic-kind api-key header on the OpenAI route, or vice versa", () => {
    const anthropicRoute = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "anthropic",
    });
    const openaiRoute = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "openai",
    });
    expect(anthropicRoute.setup[0].body).not.toContain("Authorization: Bearer");
    expect(openaiRoute.setup[0].body).not.toContain("x-api-key:");
  });

  it("warns that Junie's proxy bypasses JetBrains AI authentication, unlike every login-based agent here", () => {
    const result = customTarget({
      agent: "junie",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "anthropic",
    });
    expect(result.notes.some((note) => note.includes("bypasses"))).toBe(true);
  });

  it("still resolves Junie even when the saved provider field is stale", () => {
    // alwaysCustom agents ignore whatever is saved under `provider`; only
    // the custom base URL and renderer matter.
    const result = resolveChoice(
      {
        agent: "junie",
        provider: "whatever-was-saved-before",
        customBaseUrl: "http://localhost:11434",
        customRenderer: "raw",
      },
      PORT
    );
    expect(result.kind).toBe("custom-target");
  });

  it("rejects Junie with no base URL", () => {
    expect(resolveChoice({ agent: "junie" }, PORT).kind).toBe("error");
  });
});
