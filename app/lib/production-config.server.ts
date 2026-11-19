// ─── Production startup check ───
// Called once from app/entry.server.tsx. In production the server refuses to
// start when any variable Notifications or Receipts depend on is missing, so
// nothing is silently dropped. The error names every missing variable at once.
// Outside production it never throws: each piece falls back on its own (the
// logging Knock stand-in, the local APP_URL, the .outbox/ mail folder).
//
// KNOCK_SERVICE_TOKEN is not here: only the push script and the non-production
// sandbox check use it.
const REQUIRED_IN_PRODUCTION = [
  "KNOCK_PUBLIC_API_KEY",
  "KNOCK_API_KEY",
  "KNOCK_SIGNING_KEY",
  "KNOCK_FEED_CHANNEL_ID",
  "KNOCK_EMAIL_CHANNEL_ID",
  "APP_URL",
  "POSTMARK_SERVER_TOKEN",
] as const;

export function assertProductionConfig(
  env: Record<string, string | undefined>
): void {
  if (env.NODE_ENV !== "production") return;
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim());
  if (missing.length === 0) return;
  throw new Error(
    `Cadence will not start in production without ${missing.join(", ")}. ` +
      "Without them Notifications or Receipts would be silently dropped."
  );
}
