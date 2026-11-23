import { z } from "zod";

// ─── Is Development's email channel in sandbox mode? ───
// Knock's Development environment keeps the Postmark channel in sandbox mode
// for good: Knock renders each Notification email into its message log and
// never hands it to Postmark, so local development can't email real people.
// The switch lives only in the Knock dashboard, so outside production the
// server checks it once at startup and warns loudly when it is off. It never
// stops the server, and skips the check when there is no service token.

// A GET on Knock's Management API: path relative to /v1, parsed JSON back.
// Throws when Knock can't be reached or answers with an error.
export type ManagementGet = (path: string) => Promise<unknown>;

const MANAGEMENT_API = "https://control.knock.app/v1";

// The real one. Thin on purpose: no test constructs it.
export function managementGet(serviceToken: string): ManagementGet {
  return async (path) => {
    const response = await fetch(`${MANAGEMENT_API}${path}`, {
      headers: { Authorization: `Bearer ${serviceToken}` },
    });
    if (!response.ok) {
      throw new Error(`Knock's Management API answered ${response.status}`);
    }
    return response.json();
  };
}

// Only the fields read here. The response also holds provider settings, which
// are never logged.
const channelList = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      environment_settings: z
        .record(z.string(), z.object({ is_sandbox: z.boolean() }))
        .nullish(),
    })
  ),
});

const SETUP_SCRIPT = "scripts/postmark-knock-setup.sh";

export async function checkEmailSandbox(
  env: Record<string, string | undefined>,
  api?: ManagementGet,
  log: (line: string) => void = console.warn
): Promise<void> {
  const token = env.KNOCK_SERVICE_TOKEN;
  if (env.NODE_ENV === "production" || !token) return;

  const couldNotCheck = (reason: string) =>
    log(
      `[notifications] Could not check whether Knock's Development email ` +
        `channel is in sandbox mode (${reason}). Check it in the Knock ` +
        `dashboard: ${SETUP_SCRIPT} shows where.`
    );

  const channelId = env.KNOCK_EMAIL_CHANNEL_ID;
  if (!channelId) {
    couldNotCheck("KNOCK_EMAIL_CHANNEL_ID is not set");
    return;
  }

  let isSandbox: boolean | undefined;
  try {
    const answer = await (api ?? managementGet(token))(
      `/channels?id=${encodeURIComponent(channelId)}&include[]=environment_settings`
    );
    const parsed = channelList.safeParse(answer);
    const channel = parsed.success
      ? parsed.data.entries.find((entry) => entry.id === channelId)
      : undefined;
    isSandbox = channel?.environment_settings?.development?.is_sandbox;
  } catch (error) {
    couldNotCheck(error instanceof Error ? error.message : String(error));
    return;
  }

  if (isSandbox === undefined) {
    couldNotCheck("no Development settings found for KNOCK_EMAIL_CHANNEL_ID");
    return;
  }
  if (isSandbox) return;

  const rule = "!".repeat(72);
  log(
    [
      rule,
      "WARNING: sandbox mode is OFF on Knock's Development email channel.",
      "Notification emails from this server can reach real people's inboxes.",
      "Switch sandbox mode on in the Knock dashboard (Postmark channel,",
      `Development configuration, Advanced). ${SETUP_SCRIPT} walks you there.`,
      rule,
    ].join("\n")
  );
}
