# Notification service comparison for Cadence

Research for issue #3 (parent map: #2). Pages fetched 2026-11-17. Pricing and SDK support change often; re-check before committing to a service.

## How this was gathered

- Sources are each service's own documentation, pricing page, npm registry metadata, published package contents and official GitHub repos. No third-party write-ups.
- Nothing was tried hands-on: no account was created and no code was run against any service.
- Most pages were read through a fetch tool that summarises the page, so short quotes are as that tool relayed them.
- **Stated** means the source says it. **Inference** means it is a conclusion drawn here from what the source says. **Unconfirmed** means no primary source settled it.
- Cadence context: React Router 8.3.0 in server-rendered mode, React 19.2, a Node server, a cookie session holding a numeric id, in-app only, Cadence draws its own UI.

## Answer

**Shortlist: Knock and Novu Cloud.** Both give first-party React hooks for a self-drawn feed, declare React 19 in their peer range, vouch for the recipient with one local signing step on Cadence's server, push new notifications over a built-in WebSocket, and include batching, topics or subscriptions, preferences and Postmark email on the free plan.

They differ in ways the experience prototype and catalogue should settle:

| | Knock | Novu Cloud |
|---|---|---|
| Free plan shape | 10,000 messages a month, unlimited environments, seats and feed retention, no hard cap | 10,000 workflow runs a month, **5 workflows**, 2 environments, 3 seats, **inbox messages kept 30 days** |
| First paid step | $250 a month | from $30 a month (20 workflows, 90-day inbox retention) |
| Identity | Expiring RS256 JWT signed with a private key | HMAC-SHA256 of the id with the secret key; no expiry |
| Server render | Undocumented; hooks create the client during render | Package resolves to inert stubs on the server by design |
| Recipients per trigger | 1,000 | 100 (topics up to 100,000) |

Why the others fell away:

- **Courier** (runner-up, a judgement call): the hook, inline content with no template setup, and documented server-import safety are real strengths. It fell away because the identity token is minted by a network call to Courier rather than signed locally, there is no "seen" state separate from read and opened, grouping needs Journeys plus topics rather than a step in the send path, and adding a card bills every send including the first 10,000. Several plan gates on its pricing page could not be read reliably.
- **SuprSend**: headless hooks are good, but batching and digest, per-person preferences and objects/subscriptions all sit on the $250 Business plan, the free feed carries SuprSend branding, and the headless count fields are undocumented.
- **MagicBell**: no current React hooks package (the headless one is deprecated and removed from the repo), the free plan is 1,000 deliveries a month with one project so development and production cannot be separated, there is no batching or digest, and Postmark is not a supported email provider.

## Comparison table

| Point | Knock | Novu Cloud | MagicBell | Courier | SuprSend |
|---|---|---|---|---|---|
| 1. Headless React | Hooks in `@knocklabs/react` | Hooks in `@novu/react` | No current hooks; plain JS SDK only | `useCourier()` in `@trycourier/courier-react` | Hooks in `@suprsend/react-core` |
| React 19 peer range | `^17 \|\| ^18 \|\| ^19` | `^18 \|\| ^19` | None declared | `>=18.0.0` | `>=16.8.0` |
| Server render | Undocumented; client-only mounting likely needed (inference) | Server build is stubs; feed appears after hydration | Undocumented; code guards `window` | Documented safe to import on server (Next.js guide); client-only data | Undocumented; code guards `window` |
| 2. Identity | RS256 JWT, signed locally | HMAC-SHA256 hex, computed locally | HS256 JWT, signed locally | JWT minted by calling Courier's API | ES256 JWT, signed locally |
| Enforcement | Opt-in per environment | Opt-in per environment | Always required | Always required | Opt-in per public key |
| 3. Send from Node | `@knocklabs/node` or HTTP | `@novu/api` or HTTP | `magicbell-js` or HTTP | `@trycourier/courier` or HTTP | `@suprsend/node-sdk` or HTTP |
| Setup per type | Workflow must exist (dashboard, CLI or API) | Workflow must exist (dashboard, API or code) | None; title and content inline | None; content inline | Workflow and template must exist (dashboard, CLI or API) |
| 4. States | unseen, seen, read, archived | read, seen, archived, snoozed | read, seen, archived | read, opened, archived | seen, read, archived, pinned |
| Mark all read | Yes | Yes | Yes | Yes | Yes |
| Counts | `unread_count`, `unseen_count` | `useCounts` with filters | Unread count only | `totalUnreadCount` | Badge and per-store counts (undocumented) |
| 5. Live arrival | WebSocket, built in | WebSocket, built in | WebSocket, built in | WebSocket, built in (opt in for custom UI) | socket.io, built in |
| 6. Free tier | 10,000 messages/mo | 10,000 runs/mo, 5 workflows | 1,000 deliveries/mo, 1 project | 10,000 sends/mo | 10,000 notifications/mo |
| First paid step | $250/mo | from $30/mo | $249/mo | $0.005 per send, all sends | $100/mo |
| 7. Recipients per call | 1,000; objects and subscriptions | 100; topics | 1,000 | Array (max unstated); lists, audiences | 100; lists (objects on Business) |
| Batching | Batch step, all plans | Digest step, all plans (1-day window on Free) | None found | Journey batch and digest nodes | Business plan only |
| 8. Preferences | All plans | All plans | Yes | Yes (some gates unclear) | Business plan only |
| Postmark email | Yes | Yes | No | Yes | Yes |
| 9. Dev and tests | Unlimited environments; no in-app sandbox | Development and Production; dev runs billed | One project on free; no test mode | Test and Production; test sends billed; hook mocking documented | Sandbox, Staging, Production workspaces |

No service documents a way to run without credentials. See "Local development and tests" under each service.

## Knock

**1. Headless React**
- Stated: "use this library in a headless way and bring your own UI"; hooks are `KnockProvider`, `useKnockClient`, `useNotifications`, `useNotificationStore` (returns `items` and `metadata`). https://docs.knock.app/in-app-ui/react/overview , https://docs.knock.app/in-app-ui/react/headless/feed
- Stated: `@knocklabs/react` 0.15.1 peers `react` and `react-dom` at `^17.0.0 || ^18.0.0 || ^19.0.0`. https://registry.npmjs.org/@knocklabs/react/latest
- Stated: no server-rendering, Remix or React Router guidance in the docs or README. `react-router` is not a declared peer.
- Stated (source): the client is created and authenticated inside `useMemo`, and `useNotifications` calls `listenForUpdates()` from a `useState` initialiser, with no `window` guard. https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts , https://raw.githubusercontent.com/knocklabs/javascript/main/packages/react-core/src/modules/feed/hooks/useNotifications.ts
- Stated: `KnockProvider` has `enabled` ("When `false`, children still render but the Knock client stays idle"). https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider
- Inference: under React Router server rendering the Knock subtree should mount client-only or pass `enabled={false}` until hydrated. Untested.

**2. Recipient identity**
- Stated: by default "a request with your public key can act as any user". Enhanced security mode, set per environment, rejects requests without a signed token. https://docs.knock.app/in-app-ui/security-and-authentication
- Stated: the server signs a JWT "against your private signing key using an RS256 algorithm"; `sub` is the id; `signUserToken(id, { expiresInSeconds })` in `@knocklabs/node`, default 3600 seconds; `onUserTokenExpiring` handles refresh. Same URL and https://raw.githubusercontent.com/knocklabs/knock-node/main/README.md
- Stated: ids are up to 256 characters and cannot contain "/" or "#". https://docs.knock.app/concepts/users
- Stated: recipients can be identified inline on trigger, given as objects with an `id`. https://docs.knock.app/managing-recipients/identifying-recipients
- Inference: `String(id)` from the session works as the id.

**3. Sending**
- Stated: `client.workflows.trigger(key, { recipients, data })` in `@knocklabs/node` (Node 20+), or `POST /v1/workflows/{key}/trigger`. https://raw.githubusercontent.com/knocklabs/knock-node/main/README.md , https://docs.knock.app/api-reference/workflows/trigger
- Stated: a workflow must exist; it can be created in the dashboard, with `knock workflow new --push` and `knock push`, or by `PUT /v1/workflows/{workflow_key}`. https://docs.knock.app/cli/workflow/new , https://docs.knock.app/mapi-reference/workflows/upsert
- Stated: the hook needs a feed channel id from the dashboard. https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications

**4. State**
- Stated: unseen, seen, read, archived; per-item and bulk methods including `markAllAsRead`, `markAllAsSeen`, `markAllAsArchived`. https://docs.knock.app/in-app-ui/javascript/sdk/feed-client
- Stated: feed `meta` holds `total_count`, `unread_count`, `unseen_count`. https://docs.knock.app/api-reference/users/feeds/list_items
- Stated: headless code is "responsible for marking items as seen". https://docs.knock.app/in-app-ui/react/headless/feed

**5. Live arrival**
- Stated: the client "receives notifications over a websocket"; the hook connects automatically; the socket disconnects on hidden tabs and reconnects. https://docs.knock.app/in-app-ui/feeds/overview , https://docs.knock.app/in-app-ui/react/feed

**6. Free tier** (https://knock.app/pricing)
- Stated: Free is $0 with up to 10,000 messages a month, unlimited environments, team members and stored recipients, 30-day logs, unlimited feed retention, Knock branding not removable.
- Stated: "We don't hard cap your messages."
- Stated: a message is "a single message delivered to a single user on a single channel".
- Stated: Starter is $250 a month plus usage, 50,000 messages, $0.005 each over.

**7. Many recipients and grouping**
- Stated: up to 1,000 recipients per trigger. https://docs.knock.app/send-notifications/triggering-workflows/api
- Stated: triggering for an object fans out to its subscribers. https://docs.knock.app/concepts/subscriptions
- Stated: a batch step groups per recipient with an optional batch key and a fixed or sliding window, on all plans. https://docs.knock.app/designing-workflows/batch-function

**8. Later needs**
- Stated: per-recipient preference sets, enforced at run time, on all plans. https://docs.knock.app/concepts/preferences
- Stated: "Knock integrates with Postmark to send email notifications". https://docs.knock.app/integrations/email/postmark

**9. Local development and tests**
- Stated: environments are isolated, with their own `pk_` and `sk_` keys. https://docs.knock.app/concepts/environments , https://docs.knock.app/developer-tools/api-keys
- Stated: "The in-app channel doesn't support sandbox mode". https://docs.knock.app/manage-your-account/knock-plans
- Inference: `enabled={false}` gives an idle client for tests and credential-free local runs; the Node trigger would be stubbed the way `mailer.server.ts` falls back today.

## Novu Cloud

**1. Headless React**
- Stated: "Build a fully custom notification inbox with Novu's headless React hooks"; `NovuProvider`, `useNotifications`, `useCounts`, `useNovu`, `usePreferences`. https://docs.novu.co/platform/inbox/headless-mode
- Stated: `@novu/react` 3.20.0 peers `react` at `^18.0.0 || ^19.0.0 || ^19.0.0-0`. https://registry.npmjs.org/@novu/react/latest
- Stated (package): the default export condition resolves to a server build where `NovuProvider` renders children and hooks return no data with `isLoading: false`; only the `browser` condition gets the real hooks. `@novu/react/hooks` has no such split. https://registry.npmjs.org/@novu/react/-/react-3.20.0.tgz
- Stated: only a Remix-era quickstart exists; nothing for React Router. https://docs.novu.co/platform/quickstart/remix
- Inference: importing from `@novu/react` is safe on the server; the feed appears after hydration. UI branching on `isLoading` in the first render could mismatch, so gate on a mounted flag.

**2. Recipient identity**
- Stated: "The hash is computed as `HMAC-SHA256(secretKey, subscriberId)` and returned as a lowercase hex string", passed to the client as `subscriberHash`. https://docs.novu.co/platform/inbox/prepare-for-production
- Stated: it is a per-environment toggle, off by default; without it "a malicious actor could potentially guess another subscriber's `subscriberId`". Same URL.
- Stated: `subscriberId` is a string; recipients are created "on the fly" at trigger. https://docs.novu.co/platform/concepts/subscribers
- Inference: sequential numeric ids make the toggle effectively mandatory. The hash has no expiry.

**3. Sending**
- Stated: `novu.trigger({ workflowId, to: { subscriberId }, payload })` in `@novu/api`, or `POST https://api.novu.co/v1/events/trigger`. `@novu/node` is deprecated. https://docs.novu.co/platform/sdks/server/typescript , https://registry.npmjs.org/@novu/node/latest
- Stated: "creating a workflow is mandatory"; it can be defined "in the Novu dashboard, using the Novu API or define them in code using the Novu Framework". https://docs.novu.co/platform/concepts/workflows , https://docs.novu.co/platform/workflow/create-a-workflow
- Stated: the code path needs a publicly reachable bridge endpoint. https://docs.novu.co/framework/deployment/cli

**4. State**
- Stated: `isRead`, `isSeen`, `isArchived`, `isSnoozed`; `readAll`, `seenAll`, `archiveAll`, `archiveAllRead`. https://docs.novu.co/platform/sdks/react/hooks/use-notifications
- Stated: `useCounts({ filters })`, "automatically updated in real-time". https://docs.novu.co/platform/sdks/react/hooks/use-counts

**5. Live arrival**
- Stated: "The `useNotifications` and `useCounts` hooks automatically listen for real-time events"; transport is WebSocket. https://docs.novu.co/platform/inbox/headless-mode , https://docs.novu.co/platform/sdks/javascript

**6. Free tier** (https://novu.co/pricing , https://docs.novu.co/platform/developer/limits)
- Stated: Free is $0 with 10,000 workflow runs a month, 5 workflows, 2 environments, 3 team members, unlimited recipients, 24-hour activity feed.
- Stated: "Inbox Messages | 30 days [Free] | 90 days [Pro]". https://docs.novu.co/platform/additional-resources/security
- Stated: a trigger to one recipient is one run; runs count "across all environments".
- Stated: Pro starts at $30 a month for 30,000 runs, $1.20 per extra 1,000, 20 workflows. Team starts at $250.
- Stated: branding removal is a paid-plan toggle for the drop-in Inbox. https://docs.novu.co/platform/inbox/prepare-for-production

**7. Many recipients and grouping**
- Stated: "Maximum number of recipients can be 100" per trigger. https://docs.novu.co/api-reference/events/trigger-event
- Stated: topics hold up to 100,000 recipients and `actor` excludes the person who caused the event. https://docs.novu.co/platform/concepts/topics
- Stated: the digest step groups by recipient plus one payload key; window capped at 1 day on Free. https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest

**8. Later needs**
- Stated: preferences at workflow, per-workflow and global level, with `usePreferences`. https://docs.novu.co/platform/concepts/preferences
- Stated: "It is possible to use Postmark as a provider". https://docs.novu.co/platform/integrations/email/postmark

**9. Local development and tests**
- Stated: Development and Production environments with separate keys; custom environments need Team. https://docs.novu.co/platform/developer/environments
- Stated: keyless mode exists for the drop-in `<Inbox />` only. https://docs.novu.co/platform/inbox/setup-inbox
- Inference: tests stub `@novu/api` and the hooks. The server stubs already make a no-credentials server render harmless.

## Courier

**1. Headless React**
- Stated: "You don't have to render `CourierInbox` at all"; `useCourier()` returns `inbox` with `feeds`, `totalUnreadCount` and message actions. https://www.courier.com/docs/in-app/build-a-custom-inbox.md , https://www.courier.com/docs/sdk-libraries/courier-react-web.md
- Stated: `@trycourier/courier-react` 9.3.5 peers `react >=18.0.0`; the repo develops against React 19.1.0. `@trycourier/react-hooks` and `react-inbox` are deprecated. https://registry.npmjs.org/@trycourier/courier-react , https://raw.githubusercontent.com/trycourier/courier-web/main/@trycourier/courier-react/package.json
- Stated: "Importing the package on the server is safe"; a second `signIn` in development must be guarded with a ref. Guides cover Next.js, Vite and Astro only. https://www.courier.com/docs/guides/add-an-inbox-to-nextjs.md

**2. Recipient identity**
- Stated: "Your backend mints a short-lived, scoped token with your Courier API key" via `POST https://api.courier.com/auth/issue-token` or `client.auth.issueToken({ scope, expires_in })`. https://www.courier.com/docs/in-app/authenticate-users.md
- Stated: "The SDKs do **not** refresh tokens." Same URL.
- Stated: "Courier accepts any string"; "Nothing has to exist in Courier first". https://www.courier.com/docs/recipients/overview.md
- Inference: every token needs a round trip to Courier, so sign-in to the feed depends on Courier being reachable from Cadence's server.

**3. Sending**
- Stated: `client.send.message(...)` in `@trycourier/courier` (Node 20+) or `POST https://api.courier.com/send`, with `content: { title, body }` inline and `channels: ["inbox"]`. https://www.courier.com/docs/in-app/send-to-the-inbox.md , https://www.courier.com/docs/send/overview.md

**4. State**
- Stated: `read`, `opened`, `archived` timestamps; `readAllMessages()`; `totalUnreadCount`. No separate "seen". https://www.courier.com/docs/in-app/build-a-custom-inbox.md

**5. Live arrival**
- Stated: WebSocket; a custom UI must call `inbox.listenForUpdates()` or "the inbox loads once and doesn't update again". https://www.courier.com/docs/sdk-libraries/courier-react-web.md

**6. Free tier** (https://www.courier.com/docs/workspaces/billing.md , https://www.courier.com/pricing.md)
- Stated: Developer is free with 10,000 sends a month, no per-seat or per-recipient charge.
- Stated: "Sends from every environment count, including Test".
- Stated: Business is "$0.005 for every send, with a credit card on file", "including the first 10,000".

**7. Many recipients and grouping**
- Stated: `to` takes an array, a `list_id` or an `audience_id`. https://www.courier.com/docs/send/overview.md , https://www.courier.com/docs/recipients/lists-and-audiences/lists.md
- Stated: batching is a Journey batch node; digests need a topic, template and journey. https://www.courier.com/docs/journeys/nodes/batch.md , https://www.courier.com/docs/guides/send-a-daily-digest.md

**8. Later needs**
- Stated: topic preferences enforced at send time; a Postmark integration exists. https://www.courier.com/docs/recipients/preferences/overview.md , https://www.courier.com/docs/integrations/email/postmark.md

**9. Local development and tests**
- Stated: "Every workspace starts with **Production** and **Test**"; "Courier has no separate test mode". https://www.courier.com/docs/workspaces/environments.md
- Stated: "mock `useCourier()` in tests to return test data". https://www.courier.com/docs/sdk-libraries/courier-react-web.md

## SuprSend

**1. Headless React**
- Stated: `@suprsend/react-core` gives `SuprSendProvider`, `SuprSendFeedProvider`, `useFeedData`, `useFeedClient`. https://docs.suprsend.com/docs/react-sdk-headless-feed.md
- Stated: peers `react >= 16.8.0`; `@suprsend/react-inbox` and `@suprsend/react-headless` are deprecated. https://registry.npmjs.org/@suprsend/react-core
- Stated: no server-rendering or React Router guidance.

**2. Recipient identity**
- Stated: enhanced secure mode "mandates signed user token"; ES256 JWT with `entity_type: "subscriber"` and `entity_id`; a `refreshUserToken` callback. Opt-in per public key. https://docs.suprsend.com/docs/client-authentication.md

**3. Sending**
- Stated: `supr_client.workflows.trigger(new WorkflowTriggerRequest({...}))` or `POST https://hub.suprsend.com/trigger/`; the workflow and a published template must exist, manageable by CLI or Management API. https://docs.suprsend.com/docs/node-trigger-workflow-from-api.md , https://docs.suprsend.com/reference/cli-ci-cd.md

**4. State**
- Stated: `seen_on`, `read_on`, `archived`, `is_pinned`; `markAllAsRead()`. https://docs.suprsend.com/docs/js-inapp-feed.md
- Unconfirmed: the headless count fields are visible only in source.

**5. Live arrival**
- Stated: socket.io, managed by the feed provider. https://docs.suprsend.com/docs/js-inapp-feed.md

**6. Free tier** (https://www.suprsend.com/pricing)
- Stated: Free is $0 with "10k Notifications/mo" and "In-app notification feed (with SuprSend branding)".
- Stated: Essentials is $100 a month for 50,000. Business is $250 a month and adds "Batching & Digest", "User Preferences" and "Data Modeling: Objects".

**7. Many recipients and grouping**
- Stated: "up to 100 recipients in a single workflow trigger"; lists and broadcasts on Free; batch and digest nodes on Business. https://docs.suprsend.com/docs/node-trigger-workflow-from-api.md , https://docs.suprsend.com/docs/batch.md

**8. Later needs**
- Stated: preferences exist but are a Business feature; Postmark is a supported vendor. https://docs.suprsend.com/docs/user-preferences.md , https://docs.suprsend.com/docs/postmark.md

**9. Local development and tests**
- Stated: "Every account starts with three default workspaces (Sandbox, Staging, and Production)". Test Mode covers email, SMS and WhatsApp only. https://docs.suprsend.com/docs/workspaces.md , https://docs.suprsend.com/docs/developer/test-mode.md

## MagicBell

**1. Headless React**
- Stated: `@magicbell/react` 1.14.0 exports components only and declares no peer dependencies. https://registry.npmjs.org/@magicbell/react/latest
- Stated: `@magicbell/react-headless` README: "This package is deprecated." Its source was removed from the main branch. https://registry.npmjs.org/@magicbell/react-headless , https://api.github.com/repos/magicbell/magicbell-js/contents/packages
- Stated: the current headless route is `magicbell-js` (`UserClient` and `Realtime`), with no React bindings. https://www.magicbell.com/docs/libraries/magicbell-js
- Inference: Cadence would write and maintain its own hooks and store.

**2. Recipient identity**
- Stated: "User JWTs must be signed with your project's Secret Key using the `HS256` algorithm", carrying `user_external_id` and `api_key`. Always required. https://www.magicbell.com/docs/api/authentication/user

**3. Sending**
- Stated: `client.broadcasts.createBroadcast(...)` or `POST https://api.magicbell.com/v2/broadcasts`; only `title` and `recipients` are required. https://www.magicbell.com/docs/primitive/broadcast

**4. State**
- Stated: read, seen, archived; mark-all-read and mark-all-seen; an unread count endpoint. https://www.magicbell.com/docs/libraries/magicbell-js
- Unconfirmed: no unseen-count endpoint was found.

**5. Live arrival**
- Stated: WebSocket through `Realtime` in `magicbell-js`. https://www.magicbell.com/docs/libraries/magicbell-js
- Inference: only new-notification events are pushed; state changes do not sync across tabs.

**6. Free tier** (https://www.magicbell.com/pricing)
- Stated: Builder is $0 with "1,000 Deliveries/mo." and "1 Project". Startup is $249 a month with 50,000 deliveries and 5 projects.

**7. Many recipients and grouping**
- Stated: 1 to 1,000 recipients per broadcast. https://www.magicbell.com/docs/primitive/broadcast
- Stated: workflow steps are broadcast, wait, pause and abort; no batch or digest step. https://www.magicbell.com/workflows

**8. Later needs**
- Stated: per-category channel preferences. Email providers are SMTP, Mailgun, SendGrid, Ping Email and Amazon SES; Postmark is not listed. https://www.magicbell.com/docs/channels/email

**9. Local development and tests**
- Stated: "Create projects for staging/production environments"; no test keys or test mode documented. https://www.magicbell.com/docs/quick-start

## Unconfirmed points

Across all services:
- None documents React Router or React Router framework-mode server rendering. Every server-render conclusion here is inference from package code or Next.js guidance and is untested.
- None documents a way to run with no credentials, or an official mock for app tests (Courier documents mocking its hook only).
- No service states React 19.2 support in words; the evidence is peer ranges.

Knock:
- Whether enhanced security mode is available on the Free plan (no restriction found, no positive statement).
- Which surfaces carry Knock branding on Free, and whether a headless feed is affected.
- Whether in-app messages created in a development environment count toward the 10,000.
- Whether the in-app channel can be created without the dashboard.

Novu Cloud:
- Whether the HMAC toggle is available on the Free plan.
- What happens past 10,000 runs on Free with no card.
- Whether branding applies to a hook-built UI.
- Whether each digested trigger is a billable run.
- Per-plan cells for "Headless components", "Topics" and "Code-first workflows" in the pricing table (icons did not extract).

Courier:
- The guide and the API reference disagree on whether `expires_in` is optional.
- Maximum length of a `to` array.
- What happens past 10,000 sends with no card.
- Digest and batching on the free plan (read from icon names in the pricing HTML, not text).
- Whether a message sent to someone who has never signed in is kept for their first sign-in.

SuprSend:
- Whether enhanced secure mode is available on Free.
- Whether feed branding applies to a self-drawn UI.
- Workspace count per plan.
- The minimal recipient payload for in-app only.

MagicBell:
- Whether the free plan is charged or blocked at 1,000 deliveries.
- Topic-subscriber fan-out in the v2 API.
- The API reference page was too long to read; endpoints were confirmed from the published SDK source.

Pages that did not load: `https://docs.knock.app/in-app-ui/message-statuses` and `https://docs.knock.app/developer-tools/knock-cli/reference` (404), and `https://docs.novu.co/framework/testing` (404, a guessed URL). The novuhq/novu GitHub repo was not inspected; the npm tarball was used instead.
