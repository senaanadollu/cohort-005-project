import { and, countDistinct, eq } from "drizzle-orm";
import { CourseStatus, courses, purchases, users } from "~/db/schema";
import { parseAnalyticsRange } from "~/lib/analytics";
import { getStudentRevenue, getTopBuyers } from "./audience";
import { getCourseRevenueByCountry } from "./country-revenue";
import { getCourseDropOff, getCourseProgressSummary } from "./course-progress";
import { getRatingSummary, getUnansweredQuestions } from "./feedback";
import { getCourseQuizPassRates } from "./quiz-pass-rates";
import { getRefundExposure } from "./refund-exposure";
import {
  getCourseRevenue,
  getRevenueOverTime,
  getRevenueSummary,
} from "./revenue";
import { ownedBy, parseId, purchaseScope, type Db } from "./scope";

// ─── Instructor Analytics ───
// Everything the instructor analytics page shows, computed in one call from
// the viewer, the page's search params and the current time.
//
// The search params are taken raw on purpose: who may see which instructor's
// figures, and which course a viewer may drill into, are decided here, so
// tests reach those rules the same way the page does.

export type AnalyticsViewer = { userId: number; isAdmin: boolean };

// "course" is the second tab; anything else falls back to the overview.
export type AnalyticsTab = "overview" | "course";

/**
 * Every figure on the instructor analytics page.
 *
 * Never throws on bad params: an unknown range, tab, instructor or course
 * falls back to its default. `now` is the only clock read, so the same
 * database, params and `now` always produce the same result.
 */
export function getInstructorAnalytics(
  db: Db,
  { userId, isAdmin }: AnalyticsViewer,
  params: URLSearchParams,
  now: Date
) {
  const range = parseAnalyticsRange(params.get("range"));
  const tab: AnalyticsTab =
    params.get("tab") === "course" ? "course" : "overview";

  // Instructors are pinned to their own figures; only an admin may look
  // elsewhere, and null means "every instructor".
  const instructorId = isAdmin ? parseId(params.get("instructor")) : userId;

  // The selector lists every course the viewer owns rather than only the ones
  // that sold: a course nobody is finishing is exactly what this tab is for.
  const courseOptions = db
    .select({ courseId: courses.id, title: courses.title })
    .from(courses)
    .where(ownedBy(instructorId))
    .orderBy(courses.title)
    .all();

  const requestedCourseId = parseId(params.get("course"));
  // Checked against the list rather than trusted: the id arrives in the URL,
  // and an instructor may not read another instructor's funnel.
  const selectedCourseId = courseOptions.some(
    (course) => course.courseId === requestedCourseId
  )
    ? requestedCourseId
    : null;

  const questions = getUnansweredQuestions(db, instructorId, range, now);

  const summary = getRevenueSummary(db, instructorId, range, now);

  const courseRevenue = getCourseRevenue(db, instructorId, range, now);

  // How many people paid, and how many are learning. Deliberately two numbers:
  // one team purchase is a single buyer covering several seats, and someone who
  // redeems a seat enrols without a purchase row of their own.
  const buyerCountRow = db
    .select({ buyerCount: countDistinct(purchases.userId) })
    .from(purchases)
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(purchaseScope(instructorId, range, now))
    .get();

  const students = getStudentRevenue(db, instructorId, range, now);
  const attributedRevenue = students.reduce(
    (total, student) => total + student.revenueCents,
    0
  );

  const audience = {
    buyerCount: buyerCountRow?.buyerCount ?? 0,
    studentCount: students.length,
    revenuePerStudentCents:
      students.length === 0
        ? null
        : Math.round(attributedRevenue / students.length),
  };

  // Everyone who owns at least one course, for the admin's instructor picker.
  // Owners rather than users with the instructor role: an admin who owns a
  // course contributes to the platform-wide total.
  const instructors = isAdmin
    ? db
        .selectDistinct({ id: users.id, name: users.name })
        .from(courses)
        .innerJoin(users, eq(courses.instructorId, users.id))
        .orderBy(users.name)
        .all()
    : [];

  // Drives the "publish your first course" empty state. The platform-wide view
  // always has courses in it, so the prompt only makes sense for one named
  // instructor.
  const publishedRow =
    instructorId === null
      ? undefined
      : db
          .select({ id: courses.id })
          .from(courses)
          .where(
            and(
              eq(courses.instructorId, instructorId),
              eq(courses.status, CourseStatus.Published)
            )
          )
          .get();

  const refundExposure = getRefundExposure(
    db,
    instructorId,
    range,
    now,
    summary.grossCents
  );

  return {
    // Split rather than filtered: the range applies, but questions older than
    // it are still reported, because months of silence is the urgent case.
    questions,
    audience,
    buyers: getTopBuyers(db, instructorId, range, now),
    ratings: getRatingSummary(db, instructorId, range, now),
    tab,
    range,
    isAdmin,
    instructorId,
    selectedCourseId,
    summary,
    series: getRevenueOverTime(db, instructorId, range, now),
    courses: courseRevenue,
    courseOptions,
    // Progress and drop-off carry no usable timestamp, so they span all time
    // whatever the range control says — and the tab says so on screen.
    progress:
      selectedCourseId === null
        ? null
        : getCourseProgressSummary(db, selectedCourseId),
    funnel:
      selectedCourseId === null ? null : getCourseDropOff(db, selectedCourseId),
    // Quiz attempts and purchases are both timestamped, so unlike the two
    // panels above these do honour the range control.
    quizzes:
      selectedCourseId === null
        ? null
        : getCourseQuizPassRates(db, selectedCourseId, range, now),
    countries:
      selectedCourseId === null
        ? null
        : getCourseRevenueByCountry(db, selectedCourseId, range, now),
    instructors,
    refundExposure,
    unpublished: instructorId !== null && publishedRow === undefined,
  };
}

export type InstructorAnalytics = ReturnType<typeof getInstructorAnalytics>;
