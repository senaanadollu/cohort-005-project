// PROTOTYPE — one-shot setup for the Knock spike. Creates the two workflows and
// the environment default preferences in Knock's Development environment via
// the Management API. Needs KNOCK_SERVICE_TOKEN in .env.
//
//   npx tsx --env-file=.env scripts/prototype-knock-setup.ts

const MAPI = "https://control.knock.app/v1";
const ENV = "development";
const token = process.env.KNOCK_SERVICE_TOKEN;
const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
if (!token || !feedChannelId) {
  console.error("Set KNOCK_SERVICE_TOKEN and KNOCK_FEED_CHANNEL_ID in .env");
  process.exit(1);
}

async function mapi(method: string, path: string, body?: unknown) {
  const res = await fetch(`${MAPI}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text);
    process.exit(1);
  }
  return text ? JSON.parse(text) : null;
}

const channels = await mapi("GET", `/channels?environment=${ENV}`);
const feedChannel = (channels.entries ?? channels).find(
  (c: { id: string }) => c.id === feedChannelId
);
if (!feedChannel) {
  console.error("No channel matches KNOCK_FEED_CHANNEL_ID", JSON.stringify(channels));
  process.exit(1);
}
console.log(`In-app feed channel key: ${feedChannel.key}`);

async function upsertWorkflow(
  key: string,
  name: string,
  categories: string[],
  markdownBody: string
) {
  await mapi(
    "PUT",
    `/workflows/${key}?environment=${ENV}&commit=true&commit_message=Knock+spike`,
    {
      workflow: {
        name,
        categories,
        steps: [
          {
            ref: "in_app_feed_1",
            type: "channel",
            channel_key: feedChannel.key,
            template: { markdown_body: markdownBody, action_url: "/" },
          },
        ],
      },
    }
  );
  await mapi("PUT", `/workflows/${key}/activate?environment=${ENV}`, { status: true });
}

await upsertWorkflow(
  "discussion-reply",
  "Discussion Reply",
  ["discussions"],
  "**{{ actor.name }}** replied to your question in **{{ data.lesson_title }}**: {{ data.reply_excerpt }}"
);
await upsertWorkflow(
  "new-enrollment",
  "New Enrollment",
  ["new-enrollment"],
  "**{{ actor.name }}** enrolled in **{{ data.course_title }}**"
);

// Off by default for everyone; an Instructor opts in on their own set.
const defaults = await mapi("PUT", `/environments/${ENV}/defaults`, {
  preference_set: {
    categories: {
      "new-enrollment": { channel_types: { in_app_feed: false, email: false, push: false } },
    },
  },
});
console.log(JSON.stringify(defaults, null, 2));
console.log("Done.");
export {};
