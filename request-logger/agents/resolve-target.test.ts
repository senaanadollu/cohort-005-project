import { describe, it, expect } from "vitest";
import { resolveChoice } from "../agents";
import { target } from "./test-helpers";

describe("resolveChoice — upstream hosts", () => {
  it("sends Claude Code to Anthropic", () => {
    expect(target("claude-code", "anthropic").upstreamHost).toBe(
      "api.anthropic.com"
    );
  });

  it("sends Claude Code on Vertex AI to the global Vertex endpoint", () => {
    expect(target("claude-code", "vertex").upstreamHost).toBe(
      "aiplatform.googleapis.com"
    );
  });

  it("gives Claude Code's two providers different hosts", () => {
    expect(target("claude-code", "anthropic").upstreamHost).not.toBe(
      target("claude-code", "vertex").upstreamHost
    );
  });

  it("sends Codex on an API key to OpenAI", () => {
    expect(target("codex", "openai").upstreamHost).toBe("api.openai.com");
  });

  it("sends Codex on a ChatGPT subscription to chatgpt.com", () => {
    expect(target("codex", "chatgpt").upstreamHost).toBe("chatgpt.com");
  });

  it("sends Copilot to its own host", () => {
    expect(target("copilot").upstreamHost).toBe("api.githubcopilot.com");
  });

  it("sends OpenCode on Anthropic to Anthropic", () => {
    expect(target("opencode", "anthropic").upstreamHost).toBe(
      "api.anthropic.com"
    );
  });

  it("sends OpenCode on OpenAI to OpenAI", () => {
    expect(target("opencode", "openai").upstreamHost).toBe("api.openai.com");
  });

  it("sends Pi on Anthropic to Anthropic", () => {
    expect(target("pi", "anthropic").upstreamHost).toBe("api.anthropic.com");
  });

  it("sends Pi on OpenAI to OpenAI", () => {
    expect(target("pi", "openai").upstreamHost).toBe("api.openai.com");
  });

  it("sends Pi on a ChatGPT subscription to the ChatGPT host", () => {
    expect(target("pi", "codex").upstreamHost).toBe("chatgpt.com");
  });

  it("does not send Pi on a ChatGPT subscription to the OpenAI host", () => {
    expect(target("pi", "codex").upstreamHost).not.toBe("api.openai.com");
  });

  it("sends Gemini on an API key to the public API host", () => {
    expect(target("gemini", "api-key").upstreamHost).toBe(
      "generativelanguage.googleapis.com"
    );
  });

  it("sends Gemini on a Google login to the Code Assist host", () => {
    expect(target("gemini", "google-login").upstreamHost).toBe(
      "cloudcode-pa.googleapis.com"
    );
  });

  it("gives the two Gemini routes different hosts", () => {
    expect(target("gemini", "api-key").upstreamHost).not.toBe(
      target("gemini", "google-login").upstreamHost
    );
  });

  it("sends Antigravity CLI's API key route to the same public API host as Gemini CLI's", () => {
    expect(target("antigravity", "api-key").upstreamHost).toBe(
      "generativelanguage.googleapis.com"
    );
    expect(target("antigravity", "api-key").upstreamHost).toBe(
      target("gemini", "api-key").upstreamHost
    );
  });
});

describe("resolveChoice — renderers", () => {
  it("reads Claude Code with the Anthropic renderer", () => {
    expect(target("claude-code", "anthropic").renderer).toBe("anthropic");
  });

  it("reads Claude Code on Vertex AI with the Anthropic renderer too, since Vertex's Claude endpoint is the same Messages API shape", () => {
    expect(target("claude-code", "vertex").renderer).toBe("anthropic");
  });

  it("reads Codex with the OpenAI renderer", () => {
    expect(target("codex", "openai").renderer).toBe("openai");
    expect(target("codex", "chatgpt").renderer).toBe("openai");
  });

  it("reads Copilot with the OpenAI renderer", () => {
    expect(target("copilot").renderer).toBe("openai");
  });

  it("reads OpenCode on Anthropic with the Anthropic renderer", () => {
    expect(target("opencode", "anthropic").renderer).toBe("anthropic");
  });

  it("reads OpenCode on OpenAI with the OpenAI renderer", () => {
    expect(target("opencode", "openai").renderer).toBe("openai");
  });

  it("reads Pi on a ChatGPT subscription with the OpenAI renderer", () => {
    expect(target("pi", "codex").renderer).toBe("openai");
  });

  it("reads both Gemini routes with the Gemini renderer", () => {
    expect(target("gemini", "api-key").renderer).toBe("gemini");
    expect(target("gemini", "google-login").renderer).toBe("gemini");
  });

  it("reads Antigravity CLI with the Gemini renderer too, since it speaks the same wire format", () => {
    expect(target("antigravity", "api-key").renderer).toBe("gemini");
  });
});

describe("resolveChoice — base URLs", () => {
  it("gives OpenCode the /v1 suffix its SDK needs", () => {
    expect(target("opencode", "anthropic").baseUrl).toBe(
      "http://localhost:8787/v1"
    );
  });

  it("gives Claude Code no suffix, because it appends the whole path itself", () => {
    expect(target("claude-code", "anthropic").baseUrl).toBe(
      "http://localhost:8787"
    );
  });

  it("gives Claude Code on Vertex AI no suffix either, for the same reason", () => {
    expect(target("claude-code", "vertex").baseUrl).toBe(
      "http://localhost:8787"
    );
  });

  it("gives Copilot no suffix", () => {
    expect(target("copilot").baseUrl).toBe("http://localhost:8787");
  });

  it("gives Pi on Anthropic no suffix, because Pi's SDK adds /v1/messages", () => {
    expect(target("pi", "anthropic").baseUrl).toBe("http://localhost:8787");
  });

  it("gives Pi on OpenAI the /v1 suffix, because that SDK adds only /responses", () => {
    expect(target("pi", "openai").baseUrl).toBe("http://localhost:8787/v1");
  });

  it("gives Pi on a ChatGPT subscription the /backend-api suffix", () => {
    // Pi appends /codex/responses itself, and the real endpoint sits under
    // /backend-api. Without the suffix the forwarded path loses that segment.
    expect(target("pi", "codex").baseUrl).toBe(
      "http://localhost:8787/backend-api"
    );
  });

  it("uses the port it is given", () => {
    const result = resolveChoice(
      { agent: "claude-code", provider: "anthropic" },
      { port: 9000, platform: "linux" }
    );
    expect(result.kind === "target" && result.baseUrl).toBe(
      "http://localhost:9000"
    );
  });

  it("puts the chosen port into the command", () => {
    const result = resolveChoice(
      { agent: "claude-code", provider: "anthropic" },
      { port: 9000, platform: "linux" }
    );
    expect(result.kind === "target" && result.command).toContain(
      "http://localhost:9000"
    );
  });
});

describe("resolveChoice — commands", () => {
  it("turns tool search back on for Claude Code", () => {
    expect(target("claude-code", "anthropic").command).toContain(
      "ENABLE_TOOL_SEARCH=true"
    );
  });

  it("uses the plain variable name, not the prefixed one", () => {
    expect(target("claude-code", "anthropic").command).not.toContain(
      "CLAUDE_CODE_ENABLE_TOOL_SEARCH"
    );
  });

  it("sets the base URL for Claude Code", () => {
    expect(target("claude-code", "anthropic").command).toBe(
      "ANTHROPIC_BASE_URL=http://localhost:8787 ENABLE_TOOL_SEARCH=true claude"
    );
  });

  it("sets the Vertex base URL variable for Claude Code on Vertex AI, not the plain Anthropic one", () => {
    // ANTHROPIC_BASE_URL is silently ignored once Claude Code is in Vertex
    // mode (CLAUDE_CODE_USE_VERTEX=1) — this is the whole reason the two
    // providers need different env vars.
    expect(target("claude-code", "vertex").command).toBe(
      "ANTHROPIC_VERTEX_BASE_URL=http://localhost:8787 ENABLE_TOOL_SEARCH=true claude"
    );
  });

  it("never puts the plain Anthropic variable in the Vertex command", () => {
    expect(target("claude-code", "vertex").command).not.toContain(
      "ANTHROPIC_BASE_URL=http://localhost:8787 "
    );
  });

  it("sets the base URL for Codex on an API key", () => {
    // Codex 0.133.0 has no OPENAI_BASE_URL. The flag is the only door.
    expect(target("codex", "openai").command).toBe(
      `codex -c 'openai_base_url="http://localhost:8787/v1"'`
    );
  });

  it("sets the base URL for Codex on a ChatGPT subscription", () => {
    expect(target("codex", "chatgpt").command).toBe(
      `codex -c 'openai_base_url="http://localhost:8787/backend-api/codex"'`
    );
  });

  it("never tells a Codex student to use the variable that was removed", () => {
    expect(target("codex", "openai").command).not.toContain("OPENAI_BASE_URL");
    expect(target("codex", "chatgpt").command).not.toContain("OPENAI_BASE_URL");
  });

  it("uses Copilot's own variable", () => {
    expect(target("copilot").command).toContain("COPILOT_API_URL=");
  });

  it("does not change how a Copilot student runs their agent", () => {
    // The built-in MCP servers are part of what Copilot really sends. Turning
    // them off would make the capture tidier and less true.
    expect(target("copilot").command).toBe(
      "COPILOT_API_URL=http://localhost:8787 copilot"
    );
  });

  it("carries the suffix through into the OpenCode command", () => {
    expect(target("opencode", "anthropic").command).toBe(
      "ANTHROPIC_BASE_URL=http://localhost:8787/v1 opencode"
    );
  });

  it("uses the Code Assist variable for a Gemini Google login", () => {
    expect(target("gemini", "google-login").command).toBe(
      "CODE_ASSIST_ENDPOINT=http://localhost:8787 gemini"
    );
  });

  it("uses the other variable for a Gemini API key", () => {
    expect(target("gemini", "api-key").command).toBe(
      "GOOGLE_GEMINI_BASE_URL=http://localhost:8787 gemini"
    );
  });

  it("does not mix the two Gemini variables", () => {
    expect(target("gemini", "api-key").command).not.toContain(
      "CODE_ASSIST_ENDPOINT"
    );
    expect(target("gemini", "google-login").command).not.toContain(
      "GOOGLE_GEMINI_BASE_URL"
    );
  });

  it("runs agy, not gemini, for Antigravity CLI", () => {
    expect(target("antigravity", "api-key").command).toBe(
      "GOOGLE_GEMINI_BASE_URL=http://localhost:8787 agy"
    );
  });

  it("gives Pi a bare command, because Pi has no base URL variable", () => {
    expect(target("pi", "anthropic").command).toBe("pi");
  });
});

describe("resolveChoice — commands on win32", () => {
  // A student on native Windows (not WSL, not Git Bash) has no shell that
  // understands `KEY=value bin` — PowerShell reports it as an unrecognized
  // command, which is exactly the report that prompted this. PowerShell's
  // own syntax is one `$env:KEY = 'value'` statement per variable, chained
  // with semicolons.
  const WIN = { port: 8787, platform: "win32" as NodeJS.Platform };

  function winTarget(agent: string, provider?: string) {
    const result = resolveChoice({ agent, provider }, WIN);
    if (result.kind !== "target") {
      throw new Error(
        `expected a target for ${agent}/${provider}, got ${result.kind}`
      );
    }
    return result;
  }

  it("uses PowerShell $env: syntax instead of POSIX VAR=value", () => {
    expect(winTarget("claude-code", "anthropic").command).toBe(
      "$env:ANTHROPIC_BASE_URL = 'http://localhost:8787'; " +
        "$env:ENABLE_TOOL_SEARCH = 'true'; claude"
    );
  });

  it("never prints the POSIX VAR=value form on win32", () => {
    expect(winTarget("claude-code", "anthropic").command).not.toMatch(
      /^ANTHROPIC_BASE_URL=/
    );
  });

  it("uses PowerShell $env: syntax for Claude Code on Vertex AI too", () => {
    expect(winTarget("claude-code", "vertex").command).toBe(
      "$env:ANTHROPIC_VERTEX_BASE_URL = 'http://localhost:8787'; " +
        "$env:ENABLE_TOOL_SEARCH = 'true'; claude"
    );
  });

  it("chains one assignment per variable with semicolons", () => {
    expect(winTarget("copilot").command).toBe(
      "$env:COPILOT_API_URL = 'http://localhost:8787'; copilot"
    );
  });

  it("leaves a command with no env vars unchanged, since there is nothing to rewrite", () => {
    // Pi has no base URL variable at all.
    expect(winTarget("pi", "anthropic").command).toBe("pi");
  });

  it("leaves Codex's flag-based override unchanged", () => {
    // Codex has no env var override — its whole command is a `-c` flag,
    // single-quoted. PowerShell parses a single-quoted literal the same way
    // bash does (no interpolation), so this needs no rewriting.
    expect(winTarget("codex", "openai").command).toBe(
      `codex -c 'openai_base_url="http://localhost:8787/v1"'`
    );
  });
});
