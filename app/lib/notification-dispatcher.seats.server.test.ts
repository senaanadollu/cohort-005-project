import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { makeIndividualPurchase } from "./enrollments.server";
import { dispatchPendingNotifications } from "./notification-dispatcher.server";
import { claimSeat } from "./seats.server";
import type {
  KnockResponse,
  KnockSender,
  WorkflowTrigger,
} from "./knock.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

type SentTrigger = {
  workflowKey: string;
  trigger: WorkflowTrigger;
  idempotencyKey: string;
};

function fakeSender(
  response: KnockResponse = { status: 200, body: { workflow_run_id: "run-1" } }
) {
  const sent: SentTrigger[] = [];
  const sender: KnockSender = {
    async trigger(workflowKey, trigger, idempotencyKey) {
      sent.push({ workflowKey, trigger, idempotencyKey });
      return response;
    },
  };
  return { sender, sent };
}

const log = () => {};
const NOW = new Date("2026-03-10T12:00:00Z");

function rows() {
  return db.select().from(schema.pendingNotifications).all();
}

function seatIds() {
  return db
    .select()
    .from(schema.coupons)
    .all()
    .map((seat) => seat.id);
}

function person(user: typeof schema.users.$inferSelect) {
  return { id: String(user.id), name: user.name, email: user.email };
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = db
    .insert(schema.users)
    .values({
      name: "Team Admin",
      email: "admin@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: teamAdmin.id,
      courseId: base.course.id,
      amountPaid: 29700,
      country: "US",
    })
    .returning()
    .get();
  const team = db.insert(schema.teams).values({}).returning().get();
  db.insert(schema.teamMembers)
    .values({
      teamId: team.id,
      userId: teamAdmin.id,
      role: schema.TeamMemberRole.Admin,
    })
    .run();
  for (const code of ["SEAT-1", "SEAT-2", "SEAT-3"]) {
    db.insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code,
        purchaseId: purchase.id,
      })
      .run();
  }
});

describe("dispatching a Claimed Seat", () => {
  it("triggers seat-claimed for the Team Admin who owns the licence, with the claimer as actor and the Seats left", async () => {
    claimSeat(db, "SEAT-1", base.user.id, "US", NOW);
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    const [seatId] = seatIds();
    const claimed = sent.find((s) => s.workflowKey === "seat-claimed");
    expect(claimed).toEqual({
      workflowKey: "seat-claimed",
      idempotencyKey: `seat-claimed:${seatId}`,
      trigger: {
        actor: person(base.user),
        recipients: [person(teamAdmin)],
        data: {
          seat_id: seatId,
          student_name: "Test User",
          course_id: base.course.id,
          course_title: "Test Course",
          seats_left: 2,
          target_path: `/team?seat=${seatId}`,
        },
      },
    });
  });

  it("counts down the Seats left with each claim, with no separate Notification for the last", async () => {
    const third = db
      .insert(schema.users)
      .values({
        name: "Third",
        email: "third@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const { sender, sent } = fakeSender();

    // The dispatcher reads the figure when it sends, so send after each claim.
    claimSeat(db, "SEAT-1", base.user.id, "US", NOW);
    await dispatchPendingNotifications(db, sender, log);
    claimSeat(db, "SEAT-2", base.instructor.id, "US", NOW);
    await dispatchPendingNotifications(db, sender, log);
    claimSeat(db, "SEAT-3", third.id, "US", NOW);
    await dispatchPendingNotifications(db, sender, log);

    const claimed = sent.filter((s) => s.workflowKey === "seat-claimed");
    expect(claimed.map((s) => s.trigger.data.seats_left)).toEqual([2, 1, 0]);
  });

  it("drops the actor when the Team Admin claims a Seat themselves, closing the row", async () => {
    claimSeat(db, "SEAT-1", teamAdmin.id, "US", NOW);
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent.map((s) => s.workflowKey)).not.toContain("seat-claimed");
    expect(rows().every((row) => row.sentAt !== null)).toBe(true);
  });
});

describe("dispatching a New Enrollment", () => {
  it("triggers new-enrollment for the course's Instructor after an Individual Purchase", async () => {
    const result = makeIndividualPurchase(
      db,
      base.user.id,
      base.course.id,
      7900,
      "US"
    );
    if (!result.ok) throw new Error(result.error);
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([
      {
        workflowKey: "new-enrollment",
        idempotencyKey: `new-enrollment:${result.enrollment.id}`,
        trigger: {
          actor: person(base.user),
          recipients: [person(base.instructor)],
          data: {
            enrollment_id: result.enrollment.id,
            student_id: base.user.id,
            student_name: "Test User",
            course_id: base.course.id,
            course_title: "Test Course",
            target_path: `/instructor/${base.course.id}/students?student=${base.user.id}`,
          },
        },
      },
    ]);
  });

  it("triggers new-enrollment alongside seat-claimed for a Seat claim", async () => {
    claimSeat(db, "SEAT-1", base.user.id, "US", NOW);
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent.map((s) => s.workflowKey).sort()).toEqual([
      "new-enrollment",
      "seat-claimed",
    ]);
  });

  it("drops the actor when the Instructor enrols in their own course", async () => {
    makeIndividualPurchase(db, base.instructor.id, base.course.id, 0, null);
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows()[0].sentAt).not.toBeNull();
  });

  it("closes the row without a trigger when the Enrollment is gone", async () => {
    makeIndividualPurchase(db, base.user.id, base.course.id, 7900, "US");
    db.delete(schema.enrollments).run();
    const { sender, sent } = fakeSender();

    await dispatchPendingNotifications(db, sender, log);

    expect(sent).toEqual([]);
    expect(rows()[0].sentAt).not.toBeNull();
  });
});
