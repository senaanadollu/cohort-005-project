import { NotificationType } from "../../app/db/schema";
import { NOTIFICATION_PREFERENCES_PATH } from "../../app/lib/highlight";

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

// The Notification Category's name as an email footer says it.
export const CATEGORY_NAMES: Record<PreferenceCategory, string> = {
  discussions: "Discussions",
  refunds: "Refunds",
  team: "Team",
  enrollments: "Enrollments",
};

// The email step's body is the message only: the shared layout below wraps it
// in the greeting, the button, the sign-off and the footer.
export type EmailDefinition = {
  subject: string;
  button: string;
  htmlBody: string;
  textBody: string;
};

export type WorkflowDefinition = {
  // The workflow key is the NotificationType the dispatcher triggers.
  key: NotificationType;
  name: string;
  category: PreferenceCategory;
  // The in-app feed step. Cadence renders feed rows itself from the workflow
  // key and the trigger's data; this body is what Knock's own views show.
  feed: { markdownBody: string };
  // Only the five emailed Notifications have one.
  email?: EmailDefinition;
};

// ─── Notification emails ───
// Sent straight away, one per Notification, with open and link tracking off.
// Replies are not read. The sender is per-environment configuration: the push
// reads MAIL_FROM_ADDRESS, the variable Receipts use, in the same
// "Name <address>" form, and defaults to Cadence <notifications@anadollu.com>.
export type EmailSender = { from_name: string; from_address: string };

const DEFAULT_SENDER_NAME = "Cadence";
const DEFAULT_SENDER_ADDRESS = "notifications@anadollu.com";

export function emailSenderFrom(mailFromAddress: string | undefined): EmailSender {
  const value = mailFromAddress?.trim();
  if (!value) {
    return { from_name: DEFAULT_SENDER_NAME, from_address: DEFAULT_SENDER_ADDRESS };
  }
  const named = /^(.*?)\s*<([^<>\s]+)>$/.exec(value);
  if (named) {
    return {
      from_name: named[1].trim() || DEFAULT_SENDER_NAME,
      from_address: named[2],
    };
  }
  return { from_name: DEFAULT_SENDER_NAME, from_address: value };
}

export const EMAIL_LAYOUT_KEY = "cadence";

// Every email step declares, above its message, the variables the layout
// reads: Knock only exposes the run's data to a layout after {{ content }}, or
// through the template's pre-content. `app_url` is the APP_URL the dispatcher
// adds to every trigger's data; `target_path` is the Notification's target.
export const EMAIL_PRE_CONTENT =
  '{% assign first_name = recipient.name | split: " " | first %}' +
  "{% capture button_url %}{{ data.app_url }}{{ data.target_path }}{% endcapture %}" +
  `{% capture preferences_url %}{{ data.app_url }}${NOTIFICATION_PREFERENCES_PATH}{% endcapture %}`;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The shared frame: the Cadence name as text (no images), greeting, message,
// one button, sign-off and footer. `button_label` and `category_name` come
// from each email step's pre-content.
export const EMAIL_LAYOUT = {
  name: "Cadence",
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cadence</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;font-family:${FONT};font-size:15px;line-height:1.6;color:#18181b;">
<tr><td style="padding:28px 32px 0;font-size:20px;font-weight:700;">Cadence</td></tr>
<tr><td style="padding:16px 32px 8px;">
<p style="margin:0 0 16px;">Hi {{ first_name | escape }},</p>
{{ content }}
<p style="margin:24px 0;"><a href="{{ button_url }}" style="display:inline-block;padding:10px 18px;border-radius:6px;background-color:#18181b;color:#ffffff;text-decoration:none;font-weight:600;">{{ button_label }}</a></p>
<p style="margin:0 0 24px;">— The Cadence team</p>
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #e4e4e7;font-size:13px;line-height:1.5;color:#71717a;">
You're getting this because {{ category_name }} emails are on.<br>
<a href="{{ preferences_url }}" style="color:#71717a;">Manage Notification preferences</a><br>
Replies to this email aren't read.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  text: `Cadence

Hi {{ first_name }},

{{ content }}

{{ button_label }}: {{ button_url }}

— The Cadence team

You're getting this because {{ category_name }} emails are on.
Manage Notification preferences: {{ preferences_url }}
Replies to this email aren't read.`,
};

const P = '<p style="margin:0 0 12px;">';
const QUOTE =
  '<blockquote style="margin:0 0 12px;padding:4px 0 4px 12px;border-left:3px solid #d4d4d8;color:#3f3f46;">';

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
    email: {
      subject:
        "{{ actor.name }} replied to your question in {{ data.lesson_title }}",
      button: "View the reply",
      htmlBody:
        `${P}{{ actor.name | escape }} replied to your question in "{{ data.lesson_title | escape }}":</p>\n` +
        `${QUOTE}{{ data.snippet | escape | newline_to_br }}</blockquote>`,
      textBody:
        '{{ actor.name }} replied to your question in "{{ data.lesson_title }}":\n\n' +
        "{{ data.snippet }}",
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
    email: {
      subject: "New refund request — {{ data.course_title }}",
      button: "Review the refund request",
      htmlBody:
        `${P}{{ actor.name | escape }} has asked for a refund for "{{ data.course_title | escape }}".</p>\n` +
        `${P}Amount: {{ data.amount_formatted }}</p>\n` +
        `${P}Reason: {{ data.reason | escape | newline_to_br }}</p>`,
      textBody:
        '{{ actor.name }} has asked for a refund for "{{ data.course_title }}".\n\n' +
        "Amount: {{ data.amount_formatted }}\n\n" +
        "Reason: {{ data.reason }}",
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
    email: {
      subject: "Refund approved — {{ data.course_title }}",
      button: "View your refund request",
      htmlBody:
        `${P}We have approved your refund request for "{{ data.course_title | escape }}".</p>\n` +
        `${P}{{ data.amount_formatted }}, the full amount you paid, is on its way back to you.</p>\n` +
        `{% if data.decision_note %}${P}{{ data.decision_note | escape | newline_to_br }}</p>{% endif %}`,
      textBody:
        'We have approved your refund request for "{{ data.course_title }}".\n' +
        "{{ data.amount_formatted }}, the full amount you paid, is on its way back to you." +
        "{% if data.decision_note %}\n\n{{ data.decision_note }}{% endif %}",
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
    email: {
      subject: "Refund declined — {{ data.course_title }}",
      button: "View your refund request",
      htmlBody:
        `${P}We have looked at your refund request for "{{ data.course_title | escape }}" and decided not to refund it.</p>\n` +
        `{% if data.decision_note %}${P}{{ data.decision_note | escape | newline_to_br }}</p>\n{% endif %}` +
        `${P}You still have everything you bought. If something changes, you can raise a new refund request.</p>`,
      textBody:
        'We have looked at your refund request for "{{ data.course_title }}" and decided not to refund it.' +
        "{% if data.decision_note %}\n\n{{ data.decision_note }}{% endif %}\n\n" +
        "You still have everything you bought. If something changes, you can raise a new refund request.",
    },
  },
  {
    key: NotificationType.SeatClaimed,
    name: "Claimed Seat",
    category: "team",
    feed: {
      markdownBody:
        "**{{ actor.name }}** claimed a Seat on **{{ data.course_title }}**. " +
        "{{ data.seats_left }} left.",
    },
  },
  {
    key: NotificationType.NewEnrollment,
    name: "New Enrollment",
    category: "enrollments",
    feed: {
      markdownBody:
        "**{{ actor.name }}** enrolled in **{{ data.course_title }}**.",
    },
  },
  {
    key: NotificationType.DiscussionQuestion,
    name: "Discussion Question",
    category: "discussions",
    feed: {
      markdownBody:
        "**{{ actor.name }}** asked a question in " +
        "**{{ data.lesson_title }}**: {{ data.snippet }}",
    },
    email: {
      subject: "New question in {{ data.lesson_title }}",
      button: "Answer the question",
      htmlBody:
        `${P}{{ actor.name | escape }} asked a question in "{{ data.lesson_title | escape }}" ({{ data.course_title | escape }}):</p>\n` +
        `${QUOTE}{{ data.snippet | escape | newline_to_br }}</blockquote>`,
      textBody:
        '{{ actor.name }} asked a question in "{{ data.lesson_title }}" ({{ data.course_title }}):\n\n' +
        "{{ data.snippet }}",
    },
  },
];

// The environment default preference set: one `false`, Enrollments off on the
// in-app feed channel until a person opts in. Everything unset defaults to on.
// It replaces the whole set, including what the prototypes left behind.
export const DEFAULT_PREFERENCE_SET = {
  categories: {
    enrollments: { channel_types: { in_app_feed: false } },
  },
};
