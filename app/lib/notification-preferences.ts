import { z } from "zod";
import { UserRole } from "~/db/schema";
import { knockFetch, type NotificationFeedSession } from "./knock-feed";

// ─── Notification Preferences, from the browser ───
// Stored only in Knock. The Settings card reads and writes the person's own
// "default" preference set with their signed user token.

// Knock's preference category keys (scripts/knock/definitions.ts) and the
// two Channels, by Knock's channel type.
export type PreferenceCategoryKey =
  | "discussions"
  | "refunds"
  | "team"
  | "enrollments";
export type PreferenceChannel = "email" | "in_app_feed";

export type PreferenceRow = {
  category: PreferenceCategoryKey;
  channel: PreferenceChannel;
  label: string;
  description: string;
};

const refundsForBuyers: PreferenceRow = {
  category: "refunds",
  channel: "email",
  label: "Refunds",
  description: "When your Refund Request is approved or declined",
};
const refundsForPlatformAdmin: PreferenceRow = {
  category: "refunds",
  channel: "email",
  label: "Refunds",
  description: "When someone opens a Refund Request",
};
const discussionsForInstructor: PreferenceRow = {
  category: "discussions",
  channel: "email",
  label: "Discussions",
  description: "Questions on your courses, and replies to your questions",
};
const discussionsForOthers: PreferenceRow = {
  category: "discussions",
  channel: "email",
  label: "Discussions",
  description: "Replies to your questions",
};
const teamRow: PreferenceRow = {
  category: "team",
  channel: "in_app_feed",
  label: "Team",
  description: "When someone claims a Seat",
};
const enrollmentsRow: PreferenceRow = {
  category: "enrollments",
  channel: "in_app_feed",
  label: "Enrollments",
  description: "When a Student enrols in your course",
};

// The rows a person's role can receive. Cadence decides this, not Knock.
export function preferenceRowsFor(person: {
  role: UserRole;
  isTeamAdmin: boolean;
}): PreferenceRow[] {
  switch (person.role) {
    case UserRole.Admin:
      return [refundsForPlatformAdmin, discussionsForOthers];
    case UserRole.Instructor:
      return [discussionsForInstructor, enrollmentsRow];
    case UserRole.Student:
      return [
        refundsForBuyers,
        discussionsForOthers,
        ...(person.isTeamAdmin ? [teamRow] : []),
      ];
  }
}

// ─── Reading ───

const categoryValue = z.union([
  z.boolean(),
  z
    .object({
      channel_types: z
        .object({
          email: z.boolean().nullish(),
          in_app_feed: z.boolean().nullish(),
        })
        .passthrough()
        .nullish(),
    })
    .passthrough(),
]);

const preferenceSetSchema = z
  .object({ categories: z.record(categoryValue).nullish() })
  .passthrough();

export type PreferenceSet = {
  categories?: Record<string, z.infer<typeof categoryValue>> | null;
};

// The environment default the push sets (scripts/knock/push.ts): everything
// on, except Enrollments in the Notification Feed.
function defaultFor(row: PreferenceRow): boolean {
  return !(row.category === "enrollments" && row.channel === "in_app_feed");
}

// Each row's value: the person's own setting if Knock has one, else the
// default. Merged here so the card is right whether or not Knock's response
// already includes the environment defaults.
export function resolveToggles(
  rows: PreferenceRow[],
  set: PreferenceSet | null
): Record<string, boolean> {
  const toggles: Record<string, boolean> = {};
  for (const row of rows) {
    const setting = set?.categories?.[row.category];
    const own =
      typeof setting === "boolean" ? setting : setting?.channel_types?.[row.channel];
    toggles[toggleKey(row)] = own ?? defaultFor(row);
  }
  return toggles;
}

export function toggleKey(row: Pick<PreferenceRow, "category" | "channel">) {
  return `${row.category}/${row.channel}`;
}

function preferencesPath(session: NotificationFeedSession) {
  return `/users/${encodeURIComponent(session.knockUserId)}/preferences/default`;
}

export type LoadedPreferences =
  | { ok: true; set: PreferenceSet | null }
  | { ok: false };

// A 404 is a person Knock has no preference set for yet: all defaults.
// Anything else that goes wrong is a failure the card reports.
export async function loadPreferences(
  session: NotificationFeedSession
): Promise<LoadedPreferences> {
  try {
    const response = await knockFetch(session, preferencesPath(session));
    if (response.status === 404) return { ok: true, set: null };
    if (!response.ok) return { ok: false };
    const parsed = preferenceSetSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false };
    return { ok: true, set: { categories: parsed.data.categories ?? undefined } };
  } catch {
    return { ok: false };
  }
}

// ─── Writing ───

// One toggle, written on its own Channel. A bare boolean on the category
// would silence the Notification Feed too, and without "merge" Knock would
// replace the whole set.
export async function savePreference(
  session: NotificationFeedSession,
  category: PreferenceCategoryKey,
  channel: PreferenceChannel,
  value: boolean
): Promise<boolean> {
  try {
    const response = await knockFetch(session, preferencesPath(session), {
      method: "PUT",
      body: {
        __persistence_strategy__: "merge",
        categories: { [category]: { channel_types: { [channel]: value } } },
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
