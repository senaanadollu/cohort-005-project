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
