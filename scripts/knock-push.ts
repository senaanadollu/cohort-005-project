// Pushes the Knock preference categories and workflows defined in
// scripts/knock/definitions.ts to Knock's Development environment, replacing
// what is there. Needs KNOCK_SERVICE_TOKEN and KNOCK_FEED_CHANNEL_ID in .env.
//
//   npm run knock:push

import { WORKFLOWS } from "./knock/definitions";
import { pushToKnock, type ManagementApi } from "./knock/push";

const MANAGEMENT_API = "https://control.knock.app/v1";

const token = process.env.KNOCK_SERVICE_TOKEN;
const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
if (!token || !feedChannelId) {
  console.error(
    "Set KNOCK_SERVICE_TOKEN and KNOCK_FEED_CHANNEL_ID in .env (see scripts/knock-setup.sh)."
  );
  process.exit(1);
}

const api: ManagementApi = async (method, path, body) => {
  const response = await fetch(`${MANAGEMENT_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
};

try {
  await pushToKnock(api, { feedChannelId, workflows: WORKFLOWS });
  console.log("Knock matches the repo.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
