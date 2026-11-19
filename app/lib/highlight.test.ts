import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_PREFERENCES_PATH,
  filterForLink,
  parseHighlightId,
  parseHighlightSection,
} from "./highlight";

describe("parseHighlightId", () => {
  it("reads the item id from the named query parameter", () => {
    expect(parseHighlightId(new URLSearchParams("comment=42"), "comment")).toBe(
      42
    );
  });

  it("is null when the parameter is absent", () => {
    expect(parseHighlightId(new URLSearchParams(""), "comment")).toBeNull();
  });

  it.each(["abc", "", "0", "-3", "1.5", "7x"])(
    "is null for the unusable value %j",
    (value) => {
      const params = new URLSearchParams({ comment: value });
      expect(parseHighlightId(params, "comment")).toBeNull();
    }
  );

  it("ignores other parameters", () => {
    expect(
      parseHighlightId(new URLSearchParams("seat=5"), "comment")
    ).toBeNull();
  });
});

describe("parseHighlightSection", () => {
  it("reads a known section from the named query parameter", () => {
    expect(
      parseHighlightSection(
        new URLSearchParams("section=notifications"),
        "section",
        ["notifications"]
      )
    ).toBe("notifications");
  });

  it.each(["", "profile", "Notifications"])(
    "is null for the unknown section %j",
    (value) => {
      const params = new URLSearchParams({ section: value });
      expect(
        parseHighlightSection(params, "section", ["notifications"])
      ).toBeNull();
    }
  );

  it("is null when the parameter is absent", () => {
    expect(
      parseHighlightSection(new URLSearchParams(""), "section", [
        "notifications",
      ])
    ).toBeNull();
  });
});

describe("filterForLink", () => {
  const chosen = (value: number | "all", linkedId: number | null) => ({
    value,
    linkedId,
  });

  it("keeps a filter chosen while the page showed the same linked item", () => {
    expect(filterForLink(chosen(3, 7), 7, "all")).toBe(3);
    expect(filterForLink(chosen(3, null), null, "all")).toBe(3);
  });

  it("resets a filter chosen before the link changed, in the same render, so the linked row is there to scroll to", () => {
    expect(filterForLink(chosen(3, null), 7, "all")).toBe("all");
    expect(filterForLink(chosen(3, 5), 7, "all")).toBe("all");
  });
});

describe("NOTIFICATION_PREFERENCES_PATH", () => {
  it("points at the Notifications card with a query parameter, never a fragment, so it survives the sign-in redirect", () => {
    expect(NOTIFICATION_PREFERENCES_PATH).toBe("/settings?section=notifications");
    const url = new URL(NOTIFICATION_PREFERENCES_PATH, "https://cadence.test");
    expect(url.hash).toBe("");
    expect(
      parseHighlightSection(url.searchParams, "section", ["notifications"])
    ).toBe("notifications");
  });
});
