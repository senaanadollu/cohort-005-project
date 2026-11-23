import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  outboxTransport,
  sendEmail,
  sendReceipt,
} from "./mailer.server";

describe("sendEmail", () => {
  it("writes the message to the outbox when there is no Postmark token", async () => {
    const directory = mkdtempSync(join(tmpdir(), "outbox-"));

    await sendEmail(
      { to: "liam@example.com", subject: "Hello", body: "Hi Liam" },
      outboxTransport(directory)
    );

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toMatchObject({
      to: "liam@example.com",
      subject: "Hello",
      body: "Hi Liam",
    });
  });
});

describe("sendReceipt", () => {
  const receipt = { to: "liam@example.com", subject: "Hi", body: "Hello" };

  it("swallows a transport failure and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("Postmark is down"));

    await expect(sendReceipt(receipt, { send })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0])).toContain("Postmark is down");
    error.mockRestore();
  });

  it("does not retry a failed send", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("Postmark is down"));

    await sendReceipt(receipt, { send });

    expect(send).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("outboxTransport", () => {
  it("sends from the configured address", async () => {
    const directory = mkdtempSync(join(tmpdir(), "outbox-"));
    const from = "Cadence Staging <staging@anadollu.com>";

    await outboxTransport(directory, from).send({
      to: "liam@example.com",
      subject: "Hello",
      body: "Hi",
    });

    const [file] = readdirSync(directory);
    const written = JSON.parse(readFileSync(join(directory, file), "utf8"));
    expect(written.from).toBe(from);
  });

  it("defaults to the Cadence notifications address", async () => {
    const directory = mkdtempSync(join(tmpdir(), "outbox-"));

    await outboxTransport(directory).send({
      to: "liam@example.com",
      subject: "Hello",
      body: "Hi",
    });

    const [file] = readdirSync(directory);
    const written = JSON.parse(readFileSync(join(directory, file), "utf8"));
    expect(written.from).toBe("Cadence <notifications@anadollu.com>");
  });
});
