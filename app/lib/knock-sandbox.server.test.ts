import { describe, it, expect } from "vitest";
import { checkEmailSandbox } from "./knock-sandbox.server";

const EMAIL_CHANNEL_ID = "66666666-7777-8888-9999-000000000000";

const env = {
  NODE_ENV: "development",
  KNOCK_SERVICE_TOKEN: "service-token",
  KNOCK_EMAIL_CHANNEL_ID: EMAIL_CHANNEL_ID,
};

function channelWith(isSandbox: boolean) {
  return {
    entries: [
      {
        id: EMAIL_CHANNEL_ID,
        key: "postmark",
        environment_settings: {
          development: { id: "s1", is_valid: true, is_sandbox: isSandbox },
          production: { id: "s2", is_valid: false, is_sandbox: false },
        },
      },
    ],
  };
}

function fakeApi(answer: unknown) {
  const paths: string[] = [];
  const api = async (path: string) => {
    paths.push(path);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { api, paths };
}

async function check(
  environment: Record<string, string | undefined>,
  answer: unknown
) {
  const { api, paths } = fakeApi(answer);
  const lines: string[] = [];
  await checkEmailSandbox(environment, api, (line) => lines.push(line));
  return { paths, output: lines.join("\n") };
}

describe("checkEmailSandbox", () => {
  it("asks the Management API for the email channel's environment settings", async () => {
    const { paths } = await check(env, channelWith(true));

    expect(paths).toEqual([
      `/channels?id=${EMAIL_CHANNEL_ID}&include=environment_settings`,
    ]);
  });

  it("stays quiet when Development's email channel is in sandbox mode", async () => {
    const { output } = await check(env, channelWith(true));

    expect(output).not.toMatch(/warning/i);
  });

  it("warns loudly when sandbox mode is off", async () => {
    const { output } = await check(env, channelWith(false));

    expect(output).toMatch(/WARNING/);
    expect(output).toMatch(/sandbox mode is OFF/);
    expect(output).toContain("scripts/postmark-knock-setup.sh");
  });

  it("warns, and never throws, when Knock cannot be reached", async () => {
    const { output } = await check(env, new Error("ECONNREFUSED"));

    expect(output).toMatch(/could not check/i);
  });

  it("warns when the channel or its Development settings are missing", async () => {
    const { output } = await check(env, { entries: [] });

    expect(output).toMatch(/could not check/i);
  });

  it("skips the check, silently, without a service token", async () => {
    const { paths, output } = await check(
      { ...env, KNOCK_SERVICE_TOKEN: undefined },
      channelWith(false)
    );

    expect(paths).toEqual([]);
    expect(output).toBe("");
  });

  it("never runs in production", async () => {
    const { paths, output } = await check(
      { ...env, NODE_ENV: "production" },
      channelWith(false)
    );

    expect(paths).toEqual([]);
    expect(output).toBe("");
  });
});
