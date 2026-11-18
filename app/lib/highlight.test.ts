import { describe, expect, it } from "vitest";
import { parseHighlightId } from "./highlight";

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
