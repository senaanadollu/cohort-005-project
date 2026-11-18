import { describe, expect, it } from "vitest";
import type { FeedItem } from "./knock-feed";
import {
  describeNotification,
  feedCategories,
  type NotificationRow,
} from "./notification-rows";

function item(
  workflowKey: string,
  data: Record<string, unknown>,
  actorName: string | null = "Bo"
): FeedItem {
  return {
    id: "msg_1",
    workflowKey,
    insertedAt: "2026-11-18T11:58:00.000Z",
    seen: false,
    read: false,
    actorName,
    data,
  };
}

// The headline as a reader sees it, bold parts in **stars**.
function headline(row: NotificationRow | null): string | undefined {
  return row?.headline
    .map((part) => (part.strong ? `**${part.text}**` : part.text))
    .join("");
}

describe("describeNotification", () => {
  it("a Discussion Reply names the replier and the lesson, quotes the reply and opens the comment", () => {
    const row = describeNotification(
      item("discussion-reply", {
        lesson_title: "Generics",
        course_title: "Introduction to TypeScript",
        comment_id: 9,
        snippet: "Use a type parameter.",
        target_path: "/courses/ts/lessons/4?comment=9",
      })
    );

    expect(row).toEqual({
      category: "Discussions",
      headline: [
        { text: "Bo", strong: true },
        { text: " replied to your question in ", strong: false },
        { text: "Generics", strong: true },
      ],
      snippet: "Use a type parameter.",
      targetPath: "/courses/ts/lessons/4?comment=9",
    });
  });

  it("a Discussion Question names the asker and the lesson and quotes the question", () => {
    const row = describeNotification(
      item("discussion-question", {
        lesson_title: "Generics",
        snippet: "Why <T>?",
        target_path: "/courses/ts/lessons/4?comment=8",
      })
    );

    expect(row?.category).toBe("Discussions");
    expect(headline(row)).toBe("**Bo** asked a question in **Generics**");
    expect(row?.snippet).toBe("Why <T>?");
  });

  it("an approved Refund Request names the course and shows the Platform Admin's note", () => {
    const row = describeNotification(
      item("refund-request-approved", {
        course_title: "Introduction to TypeScript",
        note: "Sorry it wasn't for you.",
        target_path: "/settings?refundRequest=3",
      })
    );

    expect(row?.category).toBe("Refunds");
    expect(headline(row)).toBe(
      "Your Refund Request for **Introduction to TypeScript** was approved"
    );
    expect(row?.snippet).toBe("Sorry it wasn't for you.");
    expect(row?.targetPath).toBe("/settings?refundRequest=3");
  });

  it("a declined Refund Request names the course and has no snippet without a note", () => {
    const row = describeNotification(
      item("refund-request-declined", {
        course_title: "Introduction to TypeScript",
        target_path: "/settings?refundRequest=3",
      })
    );

    expect(headline(row)).toBe(
      "Your Refund Request for **Introduction to TypeScript** was declined"
    );
    expect(row?.snippet).toBeNull();
  });

  it("a new Open Refund Request names the buyer, the course and the amount, and quotes the reason", () => {
    const row = describeNotification(
      item(
        "refund-request-opened",
        {
          course_title: "Introduction to TypeScript",
          amount: 7900,
          reason: "Too basic for me.",
          target_path: "/admin/refunds?refundRequest=3",
        },
        "Liam"
      )
    );

    expect(row?.category).toBe("Refunds");
    expect(headline(row)).toBe(
      "**Liam** asked for a refund for **Introduction to TypeScript** · $79.00"
    );
    expect(row?.snippet).toBe("Too basic for me.");
  });

  it("shows an amount the dispatcher already formatted as it is", () => {
    const row = describeNotification(
      item("refund-request-opened", {
        course_title: "Introduction to TypeScript",
        amount: "$79.00",
      })
    );

    expect(headline(row)).toContain("· $79.00");
  });

  it("a Claimed Seat names the Student, the course and how many Seats are left", () => {
    const row = describeNotification(
      item("seat-claimed", {
        course_title: "Introduction to TypeScript",
        seats_left: 3,
        target_path: "/team?seat=12",
      })
    );

    expect(row?.category).toBe("Team");
    expect(headline(row)).toBe(
      "**Bo** claimed a Seat on **Introduction to TypeScript** · 3 Seats left"
    );
    expect(row?.targetPath).toBe("/team?seat=12");
  });

  it("counts Seats left in plain words for one and none", () => {
    const one = describeNotification(
      item("seat-claimed", { course_title: "TS", seats_left: 1 })
    );
    const none = describeNotification(
      item("seat-claimed", { course_title: "TS", seats_left: 0 })
    );

    expect(headline(one)).toContain("· 1 Seat left");
    expect(headline(none)).toContain("· No Seats left");
  });

  it("a New Enrollment names the Student and the course and opens the Student Roster", () => {
    const row = describeNotification(
      item("new-enrollment", {
        course_title: "Introduction to TypeScript",
        target_path: "/instructor/2/students?student=5",
      })
    );

    expect(row?.category).toBe("Enrollments");
    expect(headline(row)).toBe(
      "**Bo** enrolled in **Introduction to TypeScript**"
    );
    expect(row?.snippet).toBeNull();
    expect(row?.targetPath).toBe("/instructor/2/students?student=5");
  });

  it("still reads sensibly when the actor and the trigger's fields are missing", () => {
    expect(
      headline(describeNotification(item("discussion-reply", {}, null)))
    ).toBe("**Someone** replied to your question in a lesson");
    expect(
      headline(describeNotification(item("refund-request-opened", {})))
    ).toBe("**Bo** asked for a refund for a course");
    expect(headline(describeNotification(item("seat-claimed", {})))).toBe(
      "**Bo** claimed a Seat on a course"
    );
  });

  it("opens nothing when the target path is missing or not a plain in-app path", () => {
    expect(
      describeNotification(item("new-enrollment", {}))?.targetPath
    ).toBeNull();
    expect(
      describeNotification(
        item("new-enrollment", { target_path: "//evil.example.com" })
      )?.targetPath
    ).toBeNull();
  });

  it("ignores a blank snippet", () => {
    const row = describeNotification(
      item("discussion-reply", { lesson_title: "Generics", snippet: "  " })
    );

    expect(row?.snippet).toBeNull();
  });

  it("has no row for a workflow key Cadence doesn't send", () => {
    expect(describeNotification(item("refund-approved", {}))).toBeNull();
  });
});

describe("feedCategories", () => {
  it("lists each Notification Category in the feed once, in a fixed order", () => {
    expect(
      feedCategories([
        item("seat-claimed", {}),
        item("discussion-reply", {}),
        item("discussion-question", {}),
        item("refund-request-opened", {}),
      ])
    ).toEqual(["Discussions", "Refunds", "Team"]);
  });

  it("skips Notifications Cadence doesn't send", () => {
    expect(
      feedCategories([item("refund-approved", {}), item("new-enrollment", {})])
    ).toEqual(["Enrollments"]);
  });
});
