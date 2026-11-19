export function isInAppPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return !/[\\\u0000-\u001f]/.test(value);
}

// Where sign-in and sign-up send a person: the redirectTo target when it is a
// plain in-app path, the course list otherwise.
export function signInDestination(redirectTo: string | null | undefined): string {
  return isInAppPath(redirectTo) ? redirectTo : "/courses";
}
