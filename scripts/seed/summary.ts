import { eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import {
  CourseStatus,
  LessonProgressStatus,
  UserRole,
} from "../../app/db/schema";
import * as schema from "../../app/db/schema";
import { defaultNotifications } from "../../app/lib/notifications.server";
import { syncAllUsers } from "../../app/lib/notification-preferences.server";
import { countRows, db } from "./database";
import { daysAgo } from "./helpers";

export async function printSummaryAndSyncKnock() {
  // ─── Summary ───

  const sevenDaysAgo = daysAgo(7);
  const oldestPurchase =
    db
      .select({ createdAt: sql<string>`min(${schema.purchases.createdAt})` })
      .from(schema.purchases)
      .get()?.createdAt ?? new Date().toISOString();
  const historyDays = Math.round(
    (Date.now() - Date.parse(oldestPurchase)) / 86_400_000
  );

  console.log("\n✓ Seed complete!");
  console.log(
    `  Users: ${countRows(schema.users)} (${countRows(schema.users, eq(schema.users.role, UserRole.Admin))} admin, ${countRows(schema.users, eq(schema.users.role, UserRole.Instructor))} instructors, ${countRows(schema.users, eq(schema.users.role, UserRole.Student))} students)`
  );
  console.log(`  Categories: ${countRows(schema.categories)}`);
  console.log(
    `  Courses: ${countRows(schema.courses)} (${countRows(schema.courses, eq(schema.courses.status, CourseStatus.Published))} published, ${countRows(schema.courses, eq(schema.courses.status, CourseStatus.Draft))} draft)`
  );
  console.log(
    `  Modules: ${countRows(schema.modules)}, lessons: ${countRows(schema.lessons)}`
  );
  console.log(
    `  Quizzes: ${countRows(schema.quizzes)}, attempts: ${countRows(schema.quizAttempts)}`
  );
  console.log(`  Enrollments: ${countRows(schema.enrollments)}`);
  console.log(`  Course ratings: ${countRows(schema.courseRatings)}`);
  console.log(`  Lesson comments: ${countRows(schema.comments)}`);
  console.log(
    `  Lesson progress: ${countRows(schema.lessonProgress)} (${countRows(schema.lessonProgress, eq(schema.lessonProgress.status, LessonProgressStatus.Completed))} completed)`
  );
  console.log(
    `  Video watch events: ${countRows(schema.videoWatchEvents)} (${countRows(schema.videoWatchEvents, eq(schema.videoWatchEvents.eventType, "progress"))} progress heartbeats)`
  );
  console.log(
    `  Purchases: ${countRows(schema.purchases)} (${countRows(schema.purchases, gte(schema.purchases.createdAt, sevenDaysAgo))} in the last 7 days), spanning ${historyDays} days`
  );
  console.log(
    `  Teams: ${countRows(schema.teams)}, coupons: ${countRows(schema.coupons)} (${countRows(schema.coupons, isNotNull(schema.coupons.redeemedByUserId))} redeemed)`
  );

  // ─── Sync users to Knock ───
  // Name, email, avatar, and default preferences for anyone without a set.
  if (process.env.KNOCK_SECRET_API_KEY) {
    const synced = await syncAllUsers(db, await defaultNotifications());
    console.log(`  Synced ${synced} users to Knock.`);
  } else {
    console.log("  Skipped Knock user sync: KNOCK_SECRET_API_KEY is not set.");
  }
}
