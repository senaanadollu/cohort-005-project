import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/session", () => ({
  setCurrentUserId: async () => "cookie",
}));

import { action } from "./api.switch-user";

async function switchUser(redirectTo: string) {
  const request = new Request(
    `http://localhost/api/switch-user?redirectTo=${encodeURIComponent(redirectTo)}`,
    { method: "POST", body: new URLSearchParams({ userId: "1" }) }
  );
  const response = await action({
    request,
    url: new URL(request.url),
    params: {},
    context: {},
  } as unknown as Parameters<typeof action>[0]);
  return response as Response;
}

describe("switch-user endpoint", () => {
  it("carries on to an in-app redirectTo with its query string", async () => {
    const response = await switchUser("/instructor/questions?highlight=3");
    expect(response.headers.get("Location")).toBe(
      "/instructor/questions?highlight=3"
    );
  });

  it("falls back to the default destination for a rejected redirectTo", async () => {
    const response = await switchUser("//other-site.com");
    expect(response.headers.get("Location")).toBe("/");
  });
});
