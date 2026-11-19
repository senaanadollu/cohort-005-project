import { describe, it, expect } from "vitest";
import { NotificationType } from "../../app/db/schema";
import {
  EMAIL_LAYOUT,
  EMAIL_PRE_CONTENT,
  WORKFLOWS,
  emailSenderFrom,
} from "./definitions";

describe("emailSenderFrom", () => {
  it("defaults to Cadence <notifications@anadollu.com>", () => {
    expect(emailSenderFrom(undefined)).toEqual({
      from_name: "Cadence",
      from_address: "notifications@anadollu.com",
    });
    expect(emailSenderFrom("  ")).toEqual({
      from_name: "Cadence",
      from_address: "notifications@anadollu.com",
    });
  });

  it("reads MAIL_FROM_ADDRESS in the Receipts' Name <address> form", () => {
    expect(emailSenderFrom("Cadence Staging <notify@staging.example.com>")).toEqual({
      from_name: "Cadence Staging",
      from_address: "notify@staging.example.com",
    });
  });

  it("names a bare address Cadence", () => {
    expect(emailSenderFrom("notify@staging.example.com")).toEqual({
      from_name: "Cadence",
      from_address: "notify@staging.example.com",
    });
  });
});

describe("the workflow definitions", () => {
  it("define a workflow for every NotificationType, once each", () => {
    expect(WORKFLOWS.map((workflow) => workflow.key).sort()).toEqual(
      Object.values(NotificationType).sort()
    );
  });

  it("put both Discussion Notifications in the discussions category", () => {
    const discussion = WORKFLOWS.filter((workflow) =>
      [
        NotificationType.DiscussionQuestion,
        NotificationType.DiscussionReply,
      ].includes(workflow.key)
    );
    expect(discussion).toHaveLength(2);
    expect(discussion.every((w) => w.category === "discussions")).toBe(true);
  });

  it("email the five Notifications with the PRD's subjects and buttons, and not Claimed Seat or New Enrollment", () => {
    const emails = Object.fromEntries(
      WORKFLOWS.map((w) => [
        w.key,
        w.email ? [w.email.subject, w.email.button] : null,
      ])
    );
    expect(emails).toEqual({
      "refund-request-approved": [
        "Refund approved — {{ data.course_title }}",
        "View your refund request",
      ],
      "refund-request-declined": [
        "Refund declined — {{ data.course_title }}",
        "View your refund request",
      ],
      "refund-request-opened": [
        "New refund request — {{ data.course_title }}",
        "Review the refund request",
      ],
      "discussion-question": [
        "New question in {{ data.lesson_title }}",
        "Answer the question",
      ],
      "discussion-reply": [
        "{{ actor.name }} replied to your question in {{ data.lesson_title }}",
        "View the reply",
      ],
      "seat-claimed": null,
      "new-enrollment": null,
    });
  });

  it("keep today's refund decision wording, including the Platform Admin's note", () => {
    const text = (key: NotificationType) =>
      WORKFLOWS.find((w) => w.key === key)?.email?.textBody;
    expect(text(NotificationType.RefundRequestApproved)).toBe(
      'We have approved your refund request for "{{ data.course_title }}".\n' +
        "{{ data.amount_formatted }}, the full amount you paid, is on its way back to you." +
        "{% if data.decision_note %}\n\n{{ data.decision_note }}{% endif %}"
    );
    expect(text(NotificationType.RefundRequestDeclined)).toBe(
      'We have looked at your refund request for "{{ data.course_title }}" and decided not to refund it.' +
        "{% if data.decision_note %}\n\n{{ data.decision_note }}{% endif %}\n\n" +
        "You still have everything you bought. If something changes, you can raise a new refund request."
    );
  });

  it("frame every email with the greeting, button, sign-off and footer, in HTML and plain text", () => {
    for (const layout of [EMAIL_LAYOUT.html, EMAIL_LAYOUT.text]) {
      expect(layout).toContain("Cadence");
      expect(layout).toMatch(/Hi \{\{ first_name( \| escape)? \}\},/);
      expect(layout).toContain("{{ content }}");
      expect(layout).toContain("{{ button_label }}");
      expect(layout).toContain("{{ button_url }}");
      expect(layout).toContain("— The Cadence team");
      expect(layout).toContain(
        "You're getting this because {{ category_name }} emails are on."
      );
      expect(layout).toContain("Manage Notification preferences");
      expect(layout).toContain("{{ preferences_url }}");
      expect(layout).toContain("Replies to this email aren't read.");
    }
    expect(EMAIL_LAYOUT.html).not.toMatch(/<img/i);
    expect(EMAIL_PRE_CONTENT).toContain(
      "{{ data.app_url }}{{ data.target_path }}"
    );
    expect(EMAIL_PRE_CONTENT).toContain(
      "{{ data.app_url }}/settings?section=notifications"
    );
  });
});
