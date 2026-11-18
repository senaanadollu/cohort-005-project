import { createPrivateKey, sign } from "node:crypto";
import {
  knockUser,
  type KnockResponse,
  type KnockUser,
} from "~/lib/knock.server";
import type { NotificationFeedSession } from "~/lib/knock-feed";

const KNOCK_API = "https://api.knock.app/v1";
const IDENTIFY_TIMEOUT_MS = 5000;

// ─── Identifying the user to Knock ───
// A person who has never been a recipient has no preference set in Knock, so
// Cadence identifies whoever it signs a token for. Passed in, like the
// dispatcher's KnockSender, so tests never call Knock.
export interface KnockIdentifier {
  identify(user: KnockUser): Promise<KnockResponse>;
}

// The real identifier: PUT /v1/users/{id} merges only the fields given, so it
// never touches the user's preferences or channel data. Thin: no test
// constructs it.
export function knockIdentifier(apiKey: string): KnockIdentifier {
  return {
    async identify({ id, ...details }) {
      const response = await fetch(
        `${KNOCK_API}/users/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(details),
          signal: AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
        }
      );
      return { status: response.status, body: await response.text() };
    },
  };
}

type Env = Record<string, string | undefined>;

type SessionUser = {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
};

// What the browser needs to read this person's Notification Feed and
// Notification Preferences straight from Knock. Null when the browser-side
// keys are missing (fresh clone, CI): the bell then shows an empty feed.
//
// Identifying is started but not awaited, so a slow or unreachable Knock
// never delays the page or stops the token being issued.
export async function notificationFeedSession(
  user: SessionUser,
  env: Env = process.env,
  options: {
    identifier?: KnockIdentifier;
    log?: (line: string) => void;
    now?: Date;
  } = {}
): Promise<NotificationFeedSession | null> {
  const publicKey = env.KNOCK_PUBLIC_API_KEY;
  const signingKey = env.KNOCK_SIGNING_KEY;
  const feedChannelId = env.KNOCK_FEED_CHANNEL_ID;
  if (!publicKey || !signingKey || !feedChannelId) return null;

  const log = options.log ?? console.error;
  const identifier =
    options.identifier ??
    (env.KNOCK_API_KEY ? knockIdentifier(env.KNOCK_API_KEY) : undefined);
  const recipient = knockUser(user);

  let userToken: string;
  try {
    userToken = signUserToken(recipient.id, signingKey, options.now);
  } catch (error) {
    log(
      `[notifications] KNOCK_SIGNING_KEY could not sign a user token, ` +
        `showing an empty Notification Feed: ${String(error)}`
    );
    return null;
  }

  if (identifier) {
    identifier
      .identify(recipient)
      .then((response) => {
        if (response.status >= 300) {
          log(
            `[notifications] identify ${recipient.id} failed: ` +
              `${response.status} ${String(response.body)}`
          );
        }
      })
      .catch((error: unknown) => {
        log(
          `[notifications] identify ${recipient.id} failed: ${String(error)}`
        );
      });
  }

  return {
    knockUserId: recipient.id,
    userToken,
    publicKey,
    feedChannelId,
  };
}

// ─── Knock user token ───
// Knock's enhanced security mode refuses feed and preference requests from the
// browser without a token signed for that user. Cadence signs one for whoever
// is in the session. Same claims as @knocklabs/node's signUserToken: RS256,
// `sub` = Knock user id, `iat`, `exp`.

const TOKEN_LIFETIME_SECONDS = 60 * 60;

// Knock's dashboard gives the key base-64 encoded on one line; plain PEM works
// too.
function signingKeyPem(signingKey: string): string {
  return signingKey.startsWith("-----BEGIN")
    ? signingKey
    : Buffer.from(signingKey, "base64").toString("utf-8");
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function signUserToken(
  knockUserId: string,
  signingKey: string,
  now: Date = new Date()
): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url({ alg: "RS256", typ: "JWT" });
  const payload = base64url({
    sub: knockUserId,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
  });
  const signature = sign(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    createPrivateKey(signingKeyPem(signingKey))
  ).toString("base64url");
  return `${header}.${payload}.${signature}`;
}
