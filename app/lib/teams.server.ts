import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { teamMembers, teams, TeamMemberRole } from "~/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

// ─── Team Admins ───
// A Team Admin is not a stored role: it is whoever holds an admin membership
// of a team, whatever their user role. One check for the app layout, Settings
// and the Team page.

export function getTeamForAdmin(db: Db, userId: number) {
  const membership = db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();
  if (!membership) return undefined;
  return db.select().from(teams).where(eq(teams.id, membership.teamId)).get();
}

export function isTeamAdmin(db: Db, userId: number): boolean {
  return getTeamForAdmin(db, userId) !== undefined;
}
