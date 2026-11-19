import { describe, it, expect } from "vitest";
import { assertProductionConfig } from "./production-config.server";

const complete = {
  NODE_ENV: "production",
  KNOCK_PUBLIC_API_KEY: "pk_test",
  KNOCK_API_KEY: "sk_test",
  KNOCK_SIGNING_KEY: "signing",
  KNOCK_FEED_CHANNEL_ID: "feed",
  KNOCK_EMAIL_CHANNEL_ID: "email",
  APP_URL: "https://cadence.example.com",
  POSTMARK_SERVER_TOKEN: "postmark",
};

describe("assertProductionConfig", () => {
  it("lets production start when every required variable is set", () => {
    expect(() => assertProductionConfig(complete)).not.toThrow();
  });

  it("refuses to start production and names every missing variable", () => {
    let message = "";
    try {
      assertProductionConfig({ NODE_ENV: "production" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    for (const name of [
      "KNOCK_PUBLIC_API_KEY",
      "KNOCK_API_KEY",
      "KNOCK_SIGNING_KEY",
      "KNOCK_FEED_CHANNEL_ID",
      "KNOCK_EMAIL_CHANNEL_ID",
      "APP_URL",
      "POSTMARK_SERVER_TOKEN",
    ]) {
      expect(message).toContain(name);
    }
  });

  it("treats a blank value as missing and names only what is missing", () => {
    expect(() =>
      assertProductionConfig({ ...complete, POSTMARK_SERVER_TOKEN: "  " })
    ).toThrow(/POSTMARK_SERVER_TOKEN/);

    let message = "";
    try {
      assertProductionConfig({ ...complete, KNOCK_SIGNING_KEY: undefined });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("KNOCK_SIGNING_KEY");
    expect(message).not.toContain("APP_URL");
  });

  it("does not need the Management API token, which only the push script uses", () => {
    expect(() =>
      assertProductionConfig({ ...complete, KNOCK_SERVICE_TOKEN: undefined })
    ).not.toThrow();
  });

  it("never stops a server outside production", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertProductionConfig({})).not.toThrow();
  });
});
