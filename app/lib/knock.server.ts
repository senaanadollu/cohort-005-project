// ─── Knock sender ───
// The one place Cadence calls Knock's trigger API. The dispatcher takes a
// KnockSender as a parameter, the way the mailer takes a MailTransport, so
// tests pass a fake and never call Knock.

// A person identified inline on a trigger. The Knock user id is the Cadence
// user id as a string. Bio and role stay in Cadence.
export type KnockUser = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

export type WorkflowTrigger = {
  actor: KnockUser;
  recipients: KnockUser[];
  data: Record<string, unknown>;
};

// Knock's HTTP status and parsed body. A sender only throws when no response
// came back at all (network error).
export type KnockResponse = { status: number; body: unknown };

export interface KnockSender {
  trigger(
    workflowKey: string,
    trigger: WorkflowTrigger,
    idempotencyKey: string
  ): Promise<KnockResponse>;
}

export function knockUser(user: {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
}): KnockUser {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
  };
}

const KNOCK_API = "https://api.knock.app/v1";

// The real sender. Thin on purpose: no test constructs it.
export function knockSender(apiKey: string): KnockSender {
  return {
    async trigger(workflowKey, trigger, idempotencyKey) {
      const response = await fetch(
        `${KNOCK_API}/workflows/${encodeURIComponent(workflowKey)}/trigger`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(trigger),
        }
      );
      const text = await response.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Not JSON: keep the text.
      }
      return { status: response.status, body };
    },
  };
}

// Stands in for Knock outside production when there is no KNOCK_API_KEY. It
// prints the trigger it would have sent and answers as Knock would, so the
// dispatcher marks the row sent and nothing fires late once keys are added.
export function loggingSender(
  log: (line: string) => void = console.log
): KnockSender {
  return {
    async trigger(workflowKey, trigger, idempotencyKey) {
      log(
        `[notifications] no KNOCK_API_KEY, would trigger ${workflowKey} ` +
          `(${idempotencyKey}): ${JSON.stringify(trigger)}`
      );
      return { status: 200, body: { stand_in: true } };
    },
  };
}

// Picks the sender for this environment. Throws in production when the key is
// missing, so the server refuses to start rather than drop Notifications.
export function senderFromEnv(
  env: Record<string, string | undefined>,
  log?: (line: string) => void
): KnockSender {
  const apiKey = env.KNOCK_API_KEY;
  if (apiKey) return knockSender(apiKey);
  if (env.NODE_ENV === "production") {
    throw new Error(
      "KNOCK_API_KEY is not set. Cadence will not start in production " +
        "without it, because Notifications would be silently dropped."
    );
  }
  return loggingSender(log);
}
