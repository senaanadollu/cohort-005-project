// PROTOTYPE — sends sample Notifications to the current user through Knock,
// for the Notification Feed prototype. Throwaway.

import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/api.prototype-notifications";
import { db } from "~/db";
import { teamMembers, TeamMemberRole } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { sendSampleNotifications } from "~/lib/prototype-knock.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw new Response("No user", { status: 401 });
  const isTeamAdmin = !!db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, TeamMemberRole.Admin)))
    .get();
  const sent = await sendSampleNotifications(userId, { isTeamAdmin });
  return { sent: sent.length, at: Date.now() };
}
