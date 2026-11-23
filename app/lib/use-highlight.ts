import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { parseHighlightId } from "~/lib/highlight";

/**
 * The item the current URL points at, e.g. `?comment=42`. It lives in the URL
 * only, so a reload without the parameter, or leaving the page, clears it.
 * Mark the matching element with `data-highlighted`; app.css fades it out.
 */
export function useHighlightedId(name: string): number | null {
  const [searchParams] = useSearchParams();
  return parseHighlightId(searchParams, name);
}

/**
 * Scrolls the element marked `data-highlighted` into view when the id (or
 * section name) changes.
 */
export function useScrollToHighlight(highlightedId: number | string | null) {
  useEffect(() => {
    if (highlightedId === null) return;
    document
      .querySelector("[data-highlighted]")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedId]);
}
