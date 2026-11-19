import { describe, expect, it } from "vitest";
import { isInAppPath, signInDestination } from "./redirect";

describe("isInAppPath", () => {
  it("accepts plain in-app paths, with their query strings", () => {
    expect(isInAppPath("/courses")).toBe(true);
    expect(isInAppPath("/courses/ts/lessons/4?highlight=9#c")).toBe(true);
    expect(isInAppPath("/")).toBe(true);
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(isInAppPath("//other-site.com")).toBe(false);
    expect(isInAppPath("https://other-site.com")).toBe(false);
    expect(isInAppPath("javascript:alert(1)")).toBe(false);
  });

  it("rejects backslash and control-character tricks", () => {
    expect(isInAppPath("/\\other-site.com")).toBe(false);
    expect(isInAppPath("/\t/other-site.com")).toBe(false);
  });

  it("rejects missing and relative values", () => {
    expect(isInAppPath(null)).toBe(false);
    expect(isInAppPath(undefined)).toBe(false);
    expect(isInAppPath("")).toBe(false);
    expect(isInAppPath("courses")).toBe(false);
  });
});

describe("signInDestination", () => {
  it("lands on the redirectTo target when it is a plain in-app path", () => {
    expect(signInDestination("/settings?section=notifications")).toBe(
      "/settings?section=notifications"
    );
  });

  it("falls back to the course list for a missing or unsafe target", () => {
    expect(signInDestination(null)).toBe("/courses");
    expect(signInDestination(undefined)).toBe("/courses");
    expect(signInDestination("//other-site.com")).toBe("/courses");
  });
});
