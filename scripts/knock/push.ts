import {
  CATEGORY_NAMES,
  DEFAULT_PREFERENCE_SET,
  EMAIL_LAYOUT,
  EMAIL_LAYOUT_KEY,
  EMAIL_PRE_CONTENT,
  emailSenderFrom,
  type EmailSender,
  PREFERENCE_CATEGORIES,
  type WorkflowDefinition,
} from "./definitions";

// ─── Push the repo's Knock definitions ───
// Makes Knock match scripts/knock/definitions.ts: creates the preference
// categories and the shared email layout, upserts, commits and activates each
// workflow in the Development environment, then archives the workflows and
// categories that are not defined here (such as the prototypes' leftovers).
// Takes the Management API as a parameter so tests never call Knock.

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

// The Management API names a channel by its key; .env holds its id.
async function channelKey(
  api: ManagementApi,
  channelId: string,
  envName: string
): Promise<string> {
  const channels = await listAll<{ id: string; key: string }>(
    api,
    `/channels?id=${encodeURIComponent(channelId)}`
  );
  const channel = channels.find((entry) => entry.id === channelId);
  if (!channel) {
    throw new Error(
      `No Knock channel has the id in ${envName} (${channelId}).`
    );
  }
  return channel.key;
}

type ChannelKeys = { feed: string; email: string };
type StepConfig = { channelKeys: ChannelKeys; sender: EmailSender };

// The email step on the Postmark channel. Its pre-content declares what the
// shared layout reads: the greeting's first name, the button and the footer.
function emailSteps(workflow: WorkflowDefinition, config: StepConfig) {
  const { email } = workflow;
  if (!email) return [];
  return [
    {
      ref: "email",
      type: "channel",
      channel_type: "email",
      channel_key: config.channelKeys.email,
      channel_overrides: {
        ...config.sender,
        open_tracking: false,
        link_tracking: false,
      },
      template: {
        subject: email.subject,
        html_body: email.htmlBody,
        text_body: email.textBody,
        settings: {
          layout_key: EMAIL_LAYOUT_KEY,
          pre_content:
            EMAIL_PRE_CONTENT +
            `{% assign button_label = "${email.button}" %}` +
            `{% assign category_name = "${CATEGORY_NAMES[workflow.category]}" %}`,
        },
      },
    },
  ];
}

function workflowBody(workflow: WorkflowDefinition, config: StepConfig) {
  return {
    workflow: {
      name: workflow.name,
      categories: [workflow.category],
      steps: [
        {
          ref: "in_app_feed",
          type: "channel",
          channel_key: config.channelKeys.feed,
          template: {
            markdown_body: workflow.feed.markdownBody,
            action_url: "{{ data.target_path }}",
          },
        },
        ...emailSteps(workflow, config),
      ],
    },
  };
}

export async function pushToKnock(
  api: ManagementApi,
  options: {
    feedChannelId: string;
    emailChannelId: string;
    workflows: WorkflowDefinition[];
    // The email steps' sender; defaults to Cadence <notifications@anadollu.com>.
    sender?: EmailSender;
  },
  log: (line: string) => void = console.log
): Promise<void> {
  const channelKeys: ChannelKeys = {
    feed: await channelKey(api, options.feedChannelId, "KNOCK_FEED_CHANNEL_ID"),
    email: await channelKey(
      api,
      options.emailChannelId,
      "KNOCK_EMAIL_CHANNEL_ID"
    ),
  };
  const message = encodeURIComponent("Pushed from the Cadence repo");

  for (const category of PREFERENCE_CATEGORIES) {
    await api("PUT", `/preference_categories/${category}`);
    log(`preference category ${category}: ok`);
  }

  // A layout must exist before an email step can name it.
  await api(
    "PUT",
    `/email_layouts/${EMAIL_LAYOUT_KEY}?environment=${ENVIRONMENT}&commit=true&commit_message=${message}`,
    {
      email_layout: {
        name: EMAIL_LAYOUT.name,
        html_layout: EMAIL_LAYOUT.html,
        text_layout: EMAIL_LAYOUT.text,
      },
    }
  );
  log(`email layout ${EMAIL_LAYOUT_KEY}: committed`);

  for (const workflow of options.workflows) {
    await api(
      "PUT",
      `/workflows/${workflow.key}?environment=${ENVIRONMENT}&commit=true&commit_message=${message}`,
      workflowBody(workflow, {
        channelKeys,
        sender: options.sender ?? emailSenderFrom(undefined),
      })
    );
    await api(
      "PUT",
      `/workflows/${workflow.key}/activate?environment=${ENVIRONMENT}`,
      { status: true }
    );
    log(`workflow ${workflow.key}: committed and active`);
  }

  // Replaces the whole set, so the prototype's leftover (which names a category
  // archived below) goes before the archiving. Applies at once; it is not
  // committed or promoted.
  await api("PUT", `/environments/${ENVIRONMENT}/defaults`, {
    preference_set: DEFAULT_PREFERENCE_SET,
  });
  log("environment default preference set: ok");

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
