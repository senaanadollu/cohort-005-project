import { NotificationType } from "../../app/db/schema";

// ─── What Cadence defines in Knock ───
// The source of truth for Knock's preference categories and workflows.
// `npm run knock:push` writes these to Knock through the Management API and
// archives anything in Knock that is not listed here. Nobody edits them in the
// Knock dashboard: the next push would overwrite it.

// The four Notification Categories, by their Knock preference category key.
export const PREFERENCE_CATEGORIES = [
  "discussions",
  "refunds",
  "team",
  "enrollments",
] as const;

export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export type WorkflowDefinition = {
  // The workflow key is the NotificationType the dispatcher triggers.
  key: NotificationType;
  name: string;
  category: PreferenceCategory;
  // The in-app feed step. Cadence renders feed rows itself from the workflow
  // key and the trigger's data; this body is what Knock's own views show.
  feed: { markdownBody: string };
};

export const WORKFLOWS: WorkflowDefinition[] = [
  {
    key: NotificationType.DiscussionReply,
    name: "Discussion Reply",
    category: "discussions",
    feed: {
      markdownBody:
        "**{{ actor.name }}** replied to your question in " +
        "**{{ data.lesson_title }}**: {{ data.snippet }}",
    },
  },
  {
    key: NotificationType.RefundRequestOpened,
    name: "Refund Request opened",
    category: "refunds",
    feed: {
      markdownBody:
        "**{{ actor.name }}** asked for a refund of **{{ data.course_title }}**: " +
        "{{ data.reason }}",
    },
  },
  {
    key: NotificationType.RefundRequestApproved,
    name: "Refund Request approved",
    category: "refunds",
    feed: {
      markdownBody:
        "Your refund request for **{{ data.course_title }}** was approved. " +
        "{{ data.decision_note }}",
    },
  },
  {
    key: NotificationType.RefundRequestDeclined,
    name: "Refund Request declined",
    category: "refunds",
    feed: {
      markdownBody:
        "Your refund request for **{{ data.course_title }}** was declined. " +
        "{{ data.decision_note }}",
    },
  },
];
