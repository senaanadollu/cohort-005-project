import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";

const mocks = vi.hoisted(() => ({ userId: null as number | null }));

vi.mock("~/db", () => ({ db: createTestDb() }));
vi.mock("~/lib/session", () => ({
  getCurrentUserId: async () => mocks.userId,
  getDevCountry: async () => null,
}));

import { db } from "~/db";
import { loader } from "./layout.app";

function callLoader(path: string) {
  const request = new Request(`http://localhost${path}`);
  return loader({
    request,
    url: new URL(request.url),
    params: {},
    context: {},
  } as unknown as Parameters<typeof loader>[0]);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app layout loader", () => {
  it("sends a signed-out visit to sign-in, keeping the full path and query", async () => {
    mocks.userId = null;
    const thrown = await callLoader(
      "/instructor/questions?highlight=12"
    ).catch((e) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get("Location")).toBe(
      "/login?redirectTo=%2Finstructor%2Fquestions%3Fhighlight%3D12"
    );
  });

  it("signs the Notification Feed token for whoever is in the session, so switching users switches the feed", async () => {
    const { user, instructor } = seedBaseData(
      db as unknown as ReturnType<typeof createTestDb>
    );
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("KNOCK_PUBLIC_API_KEY", "pk_test");
    vi.stubEnv(
      "KNOCK_SIGNING_KEY",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    );
    vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "feed-channel");
    // No secret key: nothing is identified, so the test never calls Knock.
    vi.stubEnv("KNOCK_API_KEY", "");

    mocks.userId = user.id;
    const asStudent = await callLoader("/dashboard");
    mocks.userId = instructor.id;
    const asInstructor = await callLoader("/dashboard");

    expect(asStudent.notificationFeed?.knockUserId).toBe(String(user.id));
    expect(asInstructor.notificationFeed?.knockUserId).toBe(
      String(instructor.id)
    );
  });

  it("gives no Notification Feed session without Knock keys", async () => {
    vi.stubEnv("KNOCK_PUBLIC_API_KEY", "");
    vi.stubEnv("KNOCK_SIGNING_KEY", "");
    vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "");
    vi.stubEnv("KNOCK_API_KEY", "");
    mocks.userId = 1;

    const data = await callLoader("/dashboard");

    expect(data.notificationFeed).toBeNull();
  });
});
