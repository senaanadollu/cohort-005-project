import { PassThrough } from "node:stream";

import type { EntryContext, RouterContextProvider } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { db } from "~/db";
import { appUrlFromEnv, senderFromEnv } from "~/lib/knock.server";
import { checkEmailSandbox } from "~/lib/knock-sandbox.server";
import { startNotificationDispatcher } from "~/lib/notification-dispatcher.server";
import { assertProductionConfig } from "~/lib/production-config.server";

// ─── Server startup ───
// The only place the Notification dispatcher and its 30-second retry sweep are
// started, so importing a service never starts them. assertProductionConfig
// throws in production when a Knock key, APP_URL or POSTMARK_SERVER_TOKEN is
// missing, which stops the server from starting. In development this module is
// re-evaluated on edits, so the previous dispatcher is stopped first.
const startup = globalThis as typeof globalThis & {
  __stopNotificationDispatcher?: () => void;
  __emailSandboxChecked?: boolean;
};
assertProductionConfig(process.env);
const sender = senderFromEnv(process.env);
const appUrl = appUrlFromEnv(process.env);
startup.__stopNotificationDispatcher?.();
startup.__stopNotificationDispatcher = startNotificationDispatcher(
  db,
  sender,
  console.log,
  appUrl
);

// Once per process, not on every re-evaluation. Never blocks or stops startup.
if (!startup.__emailSandboxChecked) {
  startup.__emailSandboxChecked = true;
  void checkEmailSandbox(process.env);
}

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              // Clear the timeout to prevent retaining the closure and memory leak
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );
  });
}
