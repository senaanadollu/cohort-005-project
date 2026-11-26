import zlib from "node:zlib";

/**
 * Turn the raw request bytes into text.
 *
 * Pi and Codex both compress their request body (zstd) when they talk to the
 * ChatGPT backend. Without this the readable document would be a page of
 * binary. The proxy still forwards, and still saves, the original bytes:
 * only the copy we read is decoded.
 *
 * A body that claims an encoding but won't decode is never silently shown as
 * if it were text — that just reproduces the original bug (a page of binary
 * in the "readable" document) with no clue why. Instead this returns a loud,
 * unmissable warning ahead of the raw bytes, so a student sees a reason
 * instead of gibberish.
 */
export function decodeRequestBody(body: Buffer, encoding?: string): string {
  const kind = (encoding ?? "").trim().toLowerCase();
  if (kind === "" || kind === "identity") return body.toString("utf8");

  if (
    kind === "zstd" &&
    typeof (zlib as any).zstdDecompressSync !== "function"
  ) {
    return decodeFailureWarning(
      body,
      `this body is zstd-compressed, but this proxy is running on Node ${process.version}, ` +
        "which has no zlib.zstdDecompressSync (that needs Node >=22.15.0 or >=23.8.0). " +
        "Upgrade Node and re-send the request to see the real body."
    );
  }

  try {
    if (kind === "zstd")
      return (zlib as any).zstdDecompressSync(body).toString("utf8");
    if (kind === "gzip") return zlib.gunzipSync(body).toString("utf8");
    if (kind === "br") return zlib.brotliDecompressSync(body).toString("utf8");
    if (kind === "deflate") return zlib.inflateSync(body).toString("utf8");
  } catch (err) {
    return decodeFailureWarning(
      body,
      `this body claims content-encoding "${kind}" but did not decode as that: ${(err as Error).message}`
    );
  }

  return decodeFailureWarning(
    body,
    `content-encoding "${kind}" is not one this tool decodes`
  );
}

function decodeFailureWarning(body: Buffer, reason: string): string {
  return (
    `[request-logger] COULD NOT DECODE THIS BODY — ${reason}\n\n` +
    "The bytes below are still compressed. They are NOT what was actually sent as text:\n\n" +
    body.toString("utf8")
  );
}
