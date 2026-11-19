import { z } from "zod";

const highlightIdSchema = z.coerce.number().int().positive();

/**
 * The item a link points at, from a query parameter such as `?comment=42`.
 * Null when the parameter is absent or is not a positive whole number, so a
 * mangled link opens the page normally with nothing highlighted.
 */
export function parseHighlightId(
  searchParams: URLSearchParams,
  name: string
): number | null {
  const raw = searchParams.get(name);
  if (raw === null || raw.trim() === "") return null;
  const parsed = highlightIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The section of a page a link points at, from a query parameter such as
 * `?section=notifications`. Null unless the value is one of `sections`.
 */
export function parseHighlightSection<Section extends string>(
  searchParams: URLSearchParams,
  name: string,
  sections: readonly Section[]
): Section | null {
  const raw = searchParams.get(name);
  return sections.find((section) => section === raw) ?? null;
}

// Where the Notification Feed's gear and the "Manage Notification preferences"
// link in Notification emails land: the Notifications card on Settings. A query
// parameter, never a #fragment, so it survives the sign-in redirect. It is a
// stable address: emails already sent keep linking here.
export const SETTINGS_SECTION_PARAM = "section";
export const SETTINGS_SECTIONS = ["notifications"] as const;
export const NOTIFICATION_PREFERENCES_PATH = `/settings?${SETTINGS_SECTION_PARAM}=notifications`;
