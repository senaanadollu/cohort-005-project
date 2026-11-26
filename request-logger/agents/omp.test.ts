import { describe, expect, it } from "vitest";

import { resolveChoice } from "../agents";
import { customTarget, PORT, target } from "./test-helpers";

describe("resolveChoice — OMP", () => {
  it("resolves OMP straight from a base URL and wire format, with no provider needed", () => {
    const result = resolveChoice(
      {
        agent: "omp",
        customBaseUrl: "http://localhost:8787",
        customRenderer: "openai",
      },
      PORT
    );
    expect(result.kind).toBe("custom-target");
  });

  it("gives OMP its own bin, with no env vars", () => {
    const result = customTarget({
      agent: "omp",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "raw",
    });
    expect(result.command).toBe("omp");
  });

  it("gives OMP its YAML models file under ~/.omp/agent/models.yml", () => {
    const result = customTarget({
      agent: "omp",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "raw",
    });
    expect(result.setup).toHaveLength(1);
    expect(result.setup[0].path).toBe("~/.omp/agent/models.yml");
    expect(result.setup[0].language).toBe("yaml");
  });

  it("puts the resolved base URL under a provider key in the YAML file", () => {
    const result = customTarget({
      agent: "omp",
      customBaseUrl: "http://localhost:11434",
      customRenderer: "raw",
    });
    expect(result.setup[0].body).toContain('baseUrl: "http://localhost:8787"');
    expect(result.setup[0].body).toContain("providers:");
  });

  it("still resolves OMP even when the saved provider field is stale", () => {
    // alwaysCustom agents ignore whatever is saved under `provider`; only the
    // custom base URL and renderer matter.
    const result = resolveChoice(
      {
        agent: "omp",
        provider: "whatever-was-saved-before",
        customBaseUrl: "http://localhost:11434",
        customRenderer: "raw",
      },
      PORT
    );
    expect(result.kind).toBe("custom-target");
  });

  it("rejects OMP with no base URL", () => {
    expect(resolveChoice({ agent: "omp" }, PORT).kind).toBe("error");
  });
});
