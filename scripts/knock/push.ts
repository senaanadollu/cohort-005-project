import { PREFERENCE_CATEGORIES, type WorkflowDefinition } from "./definitions";

// ─── Push the repo's Knock definitions ───
// Makes Knock match scripts/knock/definitions.ts: creates the preference
// categories, upserts, commits and activates each workflow in the Development
// environment, then archives the workflows and categories that are not defined
// here (such as the prototypes' leftovers). Takes the Management API as a
// parameter so tests never call Knock.

const ENVIRONMENT = "development";

// One Management API request: path relative to /v1, parsed JSON back. Throws on
// a non-2xx response.
export type ManagementApi = (
  method: "GET" | "PUT" | "DELETE",
  path: string,
  body?: unknown
) => Promise<unknown>;

type Page<T> = { entries: T[]; page_info?: { after?: string | null } };

async function listAll<T>(api: ManagementApi, path: string): Promise<T[]> {
  const entries: T[] = [];
  let after: string | null | undefined;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const page = (await api(
      "GET",
      after ? `${path}${separator}after=${encodeURIComponent(after)}` : path
    )) as Page<T>;
    entries.push(...page.entries);
    after = page.page_info?.after;
  } while (after);
  return entries;
}

function workflowBody(workflow: WorkflowDefinition, feedChannelKey: string) {
  return {
    workflow: {
      name: workflow.name,
      categories: [workflow.category],
      steps: [
        {
          ref: "in_app_feed",
          type: "channel",
          channel_key: feedChannelKey,
          template: {
            markdown_body: workflow.feed.markdownBody,
            action_url: "{{ data.target_path }}",
          },
        },
      ],
    },
  };
}

export async function pushToKnock(
  api: ManagementApi,
  options: { feedChannelId: string; workflows: WorkflowDefinition[] },
  log: (line: string) => void = console.log
): Promise<void> {
  const channels = await listAll<{ id: string; key: string }>(
    api,
    `/channels?id=${encodeURIComponent(options.feedChannelId)}`
  );
  const feedChannel = channels.find(
    (channel) => channel.id === options.feedChannelId
  );
  if (!feedChannel) {
    throw new Error(
      `No Knock channel has the id in KNOCK_FEED_CHANNEL_ID (${options.feedChannelId}).`
    );
  }

  for (const category of PREFERENCE_CATEGORIES) {
    await api("PUT", `/preference_categories/${category}`);
    log(`preference category ${category}: ok`);
  }

  for (const workflow of options.workflows) {
    const message = encodeURIComponent("Pushed from the Cadence repo");
    await api(
      "PUT",
      `/workflows/${workflow.key}?environment=${ENVIRONMENT}&commit=true&commit_message=${message}`,
      workflowBody(workflow, feedChannel.key)
    );
    await api(
      "PUT",
      `/workflows/${workflow.key}/activate?environment=${ENVIRONMENT}`,
      { status: true }
    );
    log(`workflow ${workflow.key}: committed and active`);
  }

  // Workflows go first: a leftover workflow may still use a leftover category.
  const definedWorkflows = new Set<string>(options.workflows.map((w) => w.key));
  const workflowsInKnock = await listAll<{ key: string }>(
    api,
    `/workflows?environment=${ENVIRONMENT}`
  );
  for (const { key } of workflowsInKnock) {
    if (definedWorkflows.has(key)) continue;
    await api("DELETE", `/workflows/${key}?environment=${ENVIRONMENT}`);
    log(`workflow ${key}: archived, not defined in the repo`);
  }

  const definedCategories = new Set<string>(PREFERENCE_CATEGORIES);
  const categoriesInKnock = await listAll<{ name: string }>(
    api,
    "/preference_categories"
  );
  for (const { name } of categoriesInKnock) {
    if (definedCategories.has(name)) continue;
    await api("DELETE", `/preference_categories/${name}`);
    log(`preference category ${name}: archived, not defined in the repo`);
  }
}
