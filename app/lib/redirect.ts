export function isInAppPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return !/[\\\u0000-\u001f]/.test(value);
}
