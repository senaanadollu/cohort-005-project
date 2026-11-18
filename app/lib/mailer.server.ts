import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── Transactional email ───
// Postmark delivers every email when POSTMARK_SERVER_TOKEN is set. Without a
// token (local dev, tests) each message is written to .outbox/ as a JSON file
// instead, so it can be read without sending anything.

export type Email = {
  to: string;
  subject: string;
  body: string;
};

export interface MailTransport {
  send(email: Email): Promise<void>;
}

const DEFAULT_FROM_ADDRESS = "Cadence <notifications@anadollu.com>";

// The sender is per-environment configuration (MAIL_FROM_ADDRESS), so staging
// can send from a different address than production.
function fromAddress(): string {
  return process.env.MAIL_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
}

// In production the server must not start without a Postmark token, or every
// email would silently land in a folder nobody reads.
export function assertMailConfig(env: {
  NODE_ENV?: string;
  POSTMARK_SERVER_TOKEN?: string;
}): void {
  if (env.NODE_ENV === "production" && !env.POSTMARK_SERVER_TOKEN) {
    throw new Error(
      "POSTMARK_SERVER_TOKEN is required in production. Set it before starting the server."
    );
  }
}

assertMailConfig(process.env);

export function postmarkTransport(
  serverToken: string,
  from: string = fromAddress()
): MailTransport {
  return {
    async send(email) {
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": serverToken,
        },
        body: JSON.stringify({
          From: from,
          To: email.to,
          Subject: email.subject,
          TextBody: email.body,
          MessageStream: "outbound",
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Postmark rejected the email to ${email.to}: ${response.status}`
        );
      }
    },
  };
}

export function outboxTransport(
  directory: string,
  from: string = fromAddress()
): MailTransport {
  return {
    async send(email) {
      mkdirSync(directory, { recursive: true });
      const file = join(directory, `${Date.now()}-${email.to}.json`);
      writeFileSync(
        file,
        JSON.stringify({ from, ...email }, null, 2)
      );
    },
  };
}

function defaultTransport(): MailTransport {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  return token ? postmarkTransport(token) : outboxTransport(".outbox");
}

export async function sendEmail(
  email: Email,
  transport: MailTransport = defaultTransport()
): Promise<void> {
  await transport.send(email);
}

// A Receipt confirms something the buyer already did, so failing to send it
// must never fail their action. The error is logged and the Receipt is not
// retried.
export async function sendReceipt(
  email: Email,
  transport?: MailTransport
): Promise<void> {
  try {
    await sendEmail(email, transport);
  } catch (error) {
    console.error(
      `Could not send the Receipt "${email.subject}" to ${email.to}:`,
      error
    );
  }
}
