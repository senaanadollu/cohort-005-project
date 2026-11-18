import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "~/test/setup";

const mocks = vi.hoisted(() => ({ userId: null as number | null }));

vi.mock("~/db", () => ({ db: createTestDb() }));
vi.mock("~/lib/session", () => ({
  getCurrentUserId: async () => mocks.userId,
  getDevCountry: async () => null,
}));

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
});
