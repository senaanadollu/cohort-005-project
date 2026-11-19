import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { getTeamForAdmin, isTeamAdmin } from "./teams.server";

let db: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let team: typeof schema.teams.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  team = db.insert(schema.teams).values({}).returning().get();
});

function join(userId: number, role: schema.TeamMemberRole) {
  db.insert(schema.teamMembers)
    .values({ teamId: team.id, userId, role })
    .run();
}

describe("getTeamForAdmin and isTeamAdmin", () => {
  it("find the team of a Team Admin, whatever their role", () => {
    join(base.instructor.id, schema.TeamMemberRole.Admin);

    expect(getTeamForAdmin(db, base.instructor.id)?.id).toBe(team.id);
    expect(isTeamAdmin(db, base.instructor.id)).toBe(true);
  });

  it("do not count a plain team member", () => {
    join(base.user.id, schema.TeamMemberRole.Member);

    expect(getTeamForAdmin(db, base.user.id)).toBeUndefined();
    expect(isTeamAdmin(db, base.user.id)).toBe(false);
  });

  it("are false for someone in no team", () => {
    expect(isTeamAdmin(db, base.user.id)).toBe(false);
  });
});
