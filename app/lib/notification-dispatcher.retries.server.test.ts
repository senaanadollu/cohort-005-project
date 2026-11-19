import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  discussionFixture,
  down,
  fakeSender,
  ok,
  scriptedSender,
} from "~/test/notification-dispatcher-fixtures";
import {
  dispatchPendingNotifications,
  startNotificationDispatcher,
} from "./notification-dispatcher.server";

// Retrying a failed send, the 30-second sweep and the app_url each attempt
// carries, shown with a Discussion Reply.

let fixture: ReturnType<typeof discussionFixture>;
let db: typeof fixture.db;
let base: typeof fixture.base;
let lessonId: number;

const START = new Date("2026-11-18T09:00:00.000Z");
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

function at(msAfterStart: number) {
  vi.setSystemTime(START.getTime() + msAfterStart);
}

const lines: string[] = [];
const log = (line: string) => lines.push(line);
const rows = () => fixture.rows();
const replyPending = () => fixture.replyPending();

beforeEach(() => {
  lines.length = 0;
  fixture = discussionFixture();
  ({ db, base, lessonId } = fixture);
});

describe("retrying a failed send", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    return () => vi.useRealTimers();
  });

  it("retries a row Knock could not take, and marks it sent once a later attempt succeeds", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    await dispatchPendingNotifications(db, sender, log);
    expect(rows().slice(-1)[0].sentAt).toBeNull();

    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(2);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
    expect(rows().slice(-1)[0].failedAt).toBeNull();
  });

  it("waits 90 seconds before the first retry and doubles the wait after each failure", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(down);
    const sweepAt = async (ms: number) => {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    };

    await sweepAt(0);
    await sweepAt(89 * SECOND);
    expect(sent).toHaveLength(1);
    await sweepAt(90 * SECOND);
    expect(sent).toHaveLength(2);

    // Second retry 3 minutes after the first retry.
    await sweepAt(90 * SECOND + 179 * SECOND);
    expect(sent).toHaveLength(2);
    await sweepAt(90 * SECOND + 180 * SECOND);
    expect(sent).toHaveLength(3);

    // Third retry 6 minutes after the second.
    await sweepAt(270 * SECOND + 359 * SECOND);
    expect(sent).toHaveLength(3);
    await sweepAt(270 * SECOND + 360 * SECOND);
    expect(sent).toHaveLength(4);
  });

  it("retries a 429, a network error and a 5xx alike", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(
      { status: 429, body: { code: "rate_limited" } },
      new Error("ECONNRESET"),
      { status: 500, body: "boom" },
      ok
    );

    for (const ms of [0, 1 * HOUR, 2 * HOUR, 3 * HOUR]) {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    }

    expect(sent).toHaveLength(4);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("gives up after 10 attempts, about 12 hours in and well inside Knock's 24-hour window, and keeps the row as failed", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    const { sender, sent } = scriptedSender(down);

    // Sweep every minute for a day.
    for (let ms = 0; ms <= 24 * HOUR; ms += MINUTE) {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    }

    expect(sent).toHaveLength(10);
    const row = rows().slice(-1)[0];
    expect(row.sentAt).toBeNull();
    const failedAfter =
      new Date(row.failedAt ?? "").getTime() - START.getTime();
    expect(failedAfter).toBeGreaterThan(11 * HOUR);
    expect(failedAfter).toBeLessThan(14 * HOUR);
    expect(errors.mock.calls.at(-1)?.join(" ")).toContain("giving up");
    errors.mockRestore();
  });

  it("makes no attempt more than 20 hours after the first, even when the server was down in between", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    at(0);
    await dispatchPendingNotifications(db, sender, log);
    // The server comes back the next morning.
    at(21 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    expect(rows().slice(-1)[0].failedAt).not.toBeNull();
    errors.mockRestore();
  });

  it("marks the row failed on the first attempt when Knock answers with a 4xx other than 429, and logs it as an error", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    const { sender, sent } = scriptedSender(
      { status: 422, body: { code: "invalid_params" } },
      ok
    );

    await dispatchPendingNotifications(db, sender, log);
    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    const row = rows().slice(-1)[0];
    expect(row.failedAt).not.toBeNull();
    expect(row.sentAt).toBeNull();
    expect(errors.mock.calls.flat().join(" ")).toContain("invalid_params");
    errors.mockRestore();
  });

  it("retries with the same idempotency key, rebuilding the trigger from the current data", async () => {
    const reply = replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    await dispatchPendingNotifications(db, sender, log);
    db.update(schema.users)
      .set({ name: "Renamed Instructor" })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(2);
    expect(sent[1].idempotencyKey).toBe(`discussion-reply:${reply.id}`);
    expect(sent[1].idempotencyKey).toBe(sent[0].idempotencyKey);
    expect(sent[0].trigger.actor.name).toBe("Test Instructor");
    expect(sent[1].trigger.actor.name).toBe("Renamed Instructor");
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });

  it("marks the row failed, without sending again, when Knock took an attempt whose answer was lost and rejects the reused key after the data changed", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    replyPending();
    // Knock accepted the first attempt, but the response never arrived.
    const { sender, sent } = scriptedSender(
      new Error("socket hang up"),
      { status: 422, body: { code: "idempotency_key_reused" } },
      ok
    );

    await dispatchPendingNotifications(db, sender, log);
    db.update(schema.users)
      .set({ name: "Renamed Instructor" })
      .where(eq(schema.users.id, base.instructor.id))
      .run();
    for (const ms of [1 * HOUR, 2 * HOUR, 3 * HOUR]) {
      at(ms);
      await dispatchPendingNotifications(db, sender, log);
    }

    expect(sent).toHaveLength(2);
    const row = rows().slice(-1)[0];
    expect(row.failedAt).not.toBeNull();
    expect(row.sentAt).toBeNull();
    errors.mockRestore();
  });

  it("closes the row without a retry when the reply was deleted after a failed attempt", async () => {
    const reply = replyPending();
    const { sender, sent } = scriptedSender(down, ok);

    await dispatchPendingNotifications(db, sender, log);
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, reply.id))
      .run();
    at(1 * HOUR);
    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toHaveLength(1);
    expect(rows().slice(-1)[0].sentAt).not.toBeNull();
  });
});

describe("the sweep", () => {
  it("retries a failed row about every 30 seconds once the dispatcher is started", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    at(0);
    replyPending();
    const { sender, sent } = scriptedSender(down, ok);
    const stop = startNotificationDispatcher(db, sender, log);
    try {
      await vi.waitFor(() => expect(sent).toHaveLength(1));

      // Past the 90-second backoff; the next sweep picks the row up.
      at(91 * SECOND);
      vi.advanceTimersByTime(30 * SECOND);
      expect(sent).toHaveLength(1);
      vi.advanceTimersByTime(30 * SECOND);
      vi.advanceTimersByTime(30 * SECOND);
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      await vi.waitFor(() => expect(rows().slice(-1)[0].sentAt).not.toBeNull());
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it("sends a row left pending by a restart when the dispatcher starts", async () => {
    replyPending();
    const { sender, sent } = scriptedSender(ok);
    const stop = startNotificationDispatcher(db, sender, log);
    try {
      await vi.waitFor(() => expect(sent).toHaveLength(1));
    } finally {
      stop();
    }
  });
});

describe("the site address the email button prefixes", () => {
  it("adds app_url to every trigger's data, next to the target path", async () => {
    const reply = replyPending();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(
      db,
      sender,
      log,
      "https://cadence.example.com"
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].trigger.data).toMatchObject({
      app_url: "https://cadence.example.com",
      comment_id: reply.id,
      target_path: `/courses/${base.course.slug}/lessons/${lessonId}?comment=${reply.id}`,
    });
  });

  it("supplies the app_url of the send that is making the attempt", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      at(0);
      replyPending();
      const { sender, sent } = scriptedSender(down, ok);

      await dispatchPendingNotifications(
        db,
        sender,
        log,
        "https://first.example"
      );
      at(2 * HOUR);
      await dispatchPendingNotifications(
        db,
        sender,
        log,
        "https://second.example"
      );

      expect(sent).toHaveLength(2);
      expect(sent[0].trigger.data.app_url).toBe("https://first.example");
      expect(sent[1].trigger.data.app_url).toBe("https://second.example");
    } finally {
      vi.useRealTimers();
    }
  });
});
