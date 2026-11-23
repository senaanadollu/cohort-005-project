import type { NotificationType } from "~/db/schema";
import type { FeedItem } from "~/lib/knock-feed";
import { isInAppPath } from "~/lib/redirect";
import { formatPrice } from "~/lib/utils";

// ─── What a Notification Feed row says ───
// Cadence words each row itself from the workflow key and the trigger's data
// (flat snake_case keys, see notification-definitions.server.ts), never from
// a Knock template. Every field may be missing: a row still reads sensibly.

export type NotificationCategory =
  "Discussions" | "Refunds" | "Team" | "Enrollments";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "Discussions",
  "Refunds",
  "Team",
  "Enrollments",
];

export type HeadlinePart = { text: string; strong: boolean };

export type NotificationRow = {
  category: NotificationCategory;
  headline: HeadlinePart[];
  snippet: string | null;
  // Null when the Notification carries no usable in-app path.
  targetPath: string | null;
};

type Data = Record<string, unknown>;

function text(data: Data, key: string): string | null {
  const value = data[key];
  if (typeof value !== "string") return null;
  return value.trim() === "" ? null : value;
}

function strong(value: string): HeadlinePart {
  return { text: value, strong: true };
}

function plain(value: string): HeadlinePart {
  return { text: value, strong: false };
}

// A named thing in bold, or a plain stand-in when the name is missing.
function named(value: string | null, fallback: string): HeadlinePart {
  return value ? strong(value) : plain(fallback);
}

// Amounts travel in cents, as Cadence stores them; a string is shown as is.
function amount(data: Data): string | null {
  const value = data.amount;
  if (typeof value === "number") return formatPrice(value);
  return text(data, "amount");
}

function seatsLeft(data: Data): string | null {
  const value = data.seats_left;
  if (typeof value !== "number") return null;
  if (value === 0) return "No Seats left";
  return value === 1 ? "1 Seat left" : `${value} Seats left`;
}

function suffix(value: string | null): HeadlinePart[] {
  return value ? [plain(` · ${value}`)] : [];
}

type Wording = {
  category: NotificationCategory;
  headline: (actor: HeadlinePart, data: Data) => HeadlinePart[];
  snippetKey?: string;
};

const lesson = (data: Data) => named(text(data, "lesson_title"), "a lesson");
const course = (data: Data) => named(text(data, "course_title"), "a course");

// A workflow key is the NotificationType's value. A type-only import keeps
// the database schema out of the browser bundle, and the compiler demands
// exactly one wording per NotificationType.
type WorkflowKey = `${NotificationType}`;

// One entry per workflow key Cadence sends.
const wordingsByKey: Record<WorkflowKey, Wording> = {
  "discussion-reply": {
    category: "Discussions",
    headline: (actor, data) => [
      actor,
      plain(" replied to your question in "),
      lesson(data),
    ],
    snippetKey: "snippet",
  },
  "discussion-question": {
    category: "Discussions",
    headline: (actor, data) => [
      actor,
      plain(" asked a question in "),
      lesson(data),
    ],
    snippetKey: "snippet",
  },
  "refund-request-approved": {
    category: "Refunds",
    headline: (_actor, data) => [
      plain("Your Refund Request for "),
      course(data),
      plain(" was approved"),
    ],
    snippetKey: "decision_note",
  },
  "refund-request-declined": {
    category: "Refunds",
    headline: (_actor, data) => [
      plain("Your Refund Request for "),
      course(data),
      plain(" was declined"),
    ],
    snippetKey: "decision_note",
  },
  "refund-request-opened": {
    category: "Refunds",
    headline: (actor, data) => [
      actor,
      plain(" asked for a refund for "),
      course(data),
      ...suffix(amount(data)),
    ],
    snippetKey: "reason",
  },
  "seat-claimed": {
    category: "Team",
    headline: (actor, data) => [
      actor,
      plain(" claimed a Seat on "),
      course(data),
      ...suffix(seatsLeft(data)),
    ],
  },
  "new-enrollment": {
    category: "Enrollments",
    headline: (actor, data) => [actor, plain(" enrolled in "), course(data)],
  },
};

// Feed items carry whatever key Knock holds; an unknown one has no wording.
const wordings: Partial<Record<string, Wording>> = wordingsByKey;

// Null for a workflow key Cadence doesn't send (for example one left in Knock
// by a prototype): the panel leaves it out.
export function describeNotification(item: FeedItem): NotificationRow | null {
  const wording = wordings[item.workflowKey];
  if (!wording) return null;
  // Knock's actor first; Claimed Seat and New Enrollment also carry the
  // Student's name in their data.
  const actor = strong(
    item.actorName?.trim() || text(item.data, "student_name") || "Someone"
  );
  const path = text(item.data, "target_path");
  return {
    category: wording.category,
    headline: wording.headline(actor, item.data),
    snippet: wording.snippetKey ? text(item.data, wording.snippetKey) : null,
    targetPath: isInAppPath(path) ? path : null,
  };
}

// The Notification Categories present in the feed, for the category chips.
export function feedCategories(items: FeedItem[]): NotificationCategory[] {
  const present = new Set(
    items.map((item) => wordings[item.workflowKey]?.category)
  );
  return NOTIFICATION_CATEGORIES.filter((category) => present.has(category));
}
