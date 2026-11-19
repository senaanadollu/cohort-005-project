import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createIdentifyCache,
  notificationFeedSession,
  signUserToken,
  IDENTIFY_CACHE_MS,
} from "./knock-feed.server";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
// Knock hands out the signing key base-64 encoded, on one line.
const base64Pem = Buffer.from(pem).toString("base64");

function decode(token: string) {
  const [header, payload, signature] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString()),
    payload: JSON.parse(Buffer.from(payload, "base64url").toString()),
    signatureValid: verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url")
    ),
  };
}

describe("signUserToken", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const nowSeconds = 1_795_003_200;

  it("signs an RS256 token for the user that expires in an hour", () => {
    const token = signUserToken("42", base64Pem, now);

    expect(decode(token)).toEqual({
      header: { alg: "RS256", typ: "JWT" },
      payload: { sub: "42", iat: nowSeconds, exp: nowSeconds + 3600 },
      signatureValid: true,
    });
  });

  it("accepts the signing key as plain PEM too", () => {
    expect(decode(signUserToken("7", pem, now)).signatureValid).toBe(true);
  });
});

describe("notificationFeedSession", () => {
  const ada = {
    id: 42,
    name: "Ada",
    email: "ada@example.com",
    avatarUrl: "https://example.com/ada.png",
  };
  const env = {
    KNOCK_PUBLIC_API_KEY: "pk_test",
    KNOCK_SIGNING_KEY: base64Pem,
    KNOCK_FEED_CHANNEL_ID: "feed-channel",
    KNOCK_API_KEY: "sk_test",
  };
  const quietLog = () => {};
  const okIdentifier = {
    identify: async () => ({ status: 200, body: {} }),
  };

  it("gives the browser a token signed for the user, the public key and the feed channel", async () => {
    const session = await notificationFeedSession(ada, env, {
      identified: createIdentifyCache(),
      identifier: okIdentifier,
      log: quietLog,
    });

    expect(session).toMatchObject({
      knockUserId: "42",
      publicKey: "pk_test",
      feedChannelId: "feed-channel",
    });
    expect(session && decode(session.userToken)).toMatchObject({
      payload: { sub: "42" },
      signatureValid: true,
    });
  });

  it("never hands the browser the secret API key or the signing key", async () => {
    const session = await notificationFeedSession(ada, env, {
      identified: createIdentifyCache(),
      identifier: okIdentifier,
      log: quietLog,
    });

    expect(JSON.stringify(session)).not.toContain("sk_test");
    expect(JSON.stringify(session)).not.toContain(base64Pem);
  });

  it("identifies the user to Knock with their current details", async () => {
    const identified: unknown[] = [];
    await notificationFeedSession(ada, env, {
      identified: createIdentifyCache(),
      identifier: {
        identify: async (user) => {
          identified.push(user);
          return { status: 200, body: {} };
        },
      },
      log: quietLog,
    });

    expect(identified).toEqual([
      {
        id: "42",
        name: "Ada",
        email: "ada@example.com",
        avatar: "https://example.com/ada.png",
      },
    ]);
  });

  it("still issues the token when Knock is unreachable", async () => {
    const lines: string[] = [];
    const session = await notificationFeedSession(ada, env, {
      identified: createIdentifyCache(),
      identifier: {
        identify: () => Promise.reject(new Error("ECONNREFUSED")),
      },
      log: (line) => lines.push(line),
    });

    expect(session?.knockUserId).toBe("42");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lines.join("\n")).toContain("ECONNREFUSED");
  });

  it("does not wait for Knock to answer before issuing the token", async () => {
    const session = await notificationFeedSession(ada, env, {
      identified: createIdentifyCache(),
      identifier: { identify: () => new Promise(() => {}) },
      log: quietLog,
    });

    expect(session?.knockUserId).toBe("42");
  });

  it("gives no session, rather than breaking every page, when the signing key is unusable", async () => {
    const lines: string[] = [];
    const session = await notificationFeedSession(
      ada,
      { ...env, KNOCK_SIGNING_KEY: "not-a-key" },
      { identified: createIdentifyCache(),
      identifier: okIdentifier, log: (line) => lines.push(line) }
    );

    expect(session).toBeNull();
    expect(lines.join("\n")).toContain("KNOCK_SIGNING_KEY");
  });

  it("gives no session without the browser-side Knock keys, so the bell shows an empty feed", async () => {
    let identifyCalls = 0;
    const session = await notificationFeedSession(
      ada,
      { KNOCK_API_KEY: "sk_test" },
      {
        identifier: {
          identify: async () => {
            identifyCalls++;
            return { status: 200, body: {} };
          },
        },
        log: quietLog,
      }
    );

    expect(session).toBeNull();
    expect(identifyCalls).toBe(0);
  });

  describe("identifying again on the next page load", () => {
    const t0 = new Date("2026-11-18T12:00:00Z");
    const later = (ms: number) => new Date(t0.getTime() + ms);

    function countingIdentifier(status = 200) {
      const identified: unknown[] = [];
      return {
        identified,
        identifier: {
          identify: async (user: unknown) => {
            identified.push(user);
            return { status, body: {} };
          },
        },
      };
    }

    // Lets the identify call started in the background settle.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("skips Knock for the same user with unchanged details identified recently, but still signs a fresh token", async () => {
      const cache = createIdentifyCache();
      const { identified, identifier } = countingIdentifier();
      const load = (now: Date) =>
        notificationFeedSession(ada, env, {
          identified: cache,
          identifier,
          log: quietLog,
          now,
        });

      const first = await load(t0);
      await settle();
      const second = await load(later(60_000));
      await settle();

      expect(identified).toHaveLength(1);
      expect(second?.userToken).not.toBe(first?.userToken);
      expect(second && decode(second.userToken).signatureValid).toBe(true);
    });

    it("identifies again when the name, email or avatar changed", async () => {
      const cache = createIdentifyCache();
      const { identified, identifier } = countingIdentifier();
      const load = (user: Parameters<typeof notificationFeedSession>[0]) =>
        notificationFeedSession(user, env, {
          identified: cache,
          identifier,
          log: quietLog,
          now: t0,
        });

      await load(ada);
      await settle();
      await load({ ...ada, name: "Ada Lovelace" });
      await settle();
      await load({ ...ada, name: "Ada Lovelace", email: "ada@new.example" });
      await settle();
      await load({
        ...ada,
        name: "Ada Lovelace",
        email: "ada@new.example",
        avatarUrl: null,
      });
      await settle();

      expect(identified).toHaveLength(4);
    });

    it("identifies again once the time limit has passed", async () => {
      const cache = createIdentifyCache();
      const { identified, identifier } = countingIdentifier();
      const load = (now: Date) =>
        notificationFeedSession(ada, env, {
          identified: cache,
          identifier,
          log: quietLog,
          now,
        });

      await load(t0);
      await settle();
      await load(later(IDENTIFY_CACHE_MS + 1));
      await settle();

      expect(identified).toHaveLength(2);
    });

    it("tries again on the next load when Knock refused or could not be reached", async () => {
      const cache = createIdentifyCache();
      const refused = countingIdentifier(500);
      const options = {
        identified: cache,
        log: quietLog,
        now: t0,
      };

      await notificationFeedSession(ada, env, {
        ...options,
        identifier: refused.identifier,
      });
      await settle();
      await notificationFeedSession(ada, env, {
        ...options,
        identifier: { identify: () => Promise.reject(new Error("ECONNRESET")) },
      });
      await settle();
      const session = await notificationFeedSession(ada, env, {
        ...options,
        identifier: refused.identifier,
      });
      await settle();

      expect(refused.identified).toHaveLength(2);
      expect(session?.knockUserId).toBe("42");
    });

    it("identifies each user on their own", async () => {
      const cache = createIdentifyCache();
      const { identified, identifier } = countingIdentifier();
      for (const user of [ada, { ...ada, id: 43 }]) {
        await notificationFeedSession(user, env, {
          identified: cache,
          identifier,
          log: quietLog,
          now: t0,
        });
        await settle();
      }

      expect(identified).toHaveLength(2);
    });
  });
});
