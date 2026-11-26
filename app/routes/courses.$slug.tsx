import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/courses.$slug";
import { coursePermissions } from "~/modules/permissions/course-permissions.server";
import { db } from "~/db";
import { data } from "react-router";
import { getRefundOffer, type RefundOffer } from "~/lib/refunds.server";
import {
  calculateProgress,
  getCourseWithDetails,
  getLessonCountForCourse,
  getLessonProgressForCourse,
  getNextIncompleteLesson,
} from "~/lib/course-detail.server";
import {
  findRating,
  getCourseRatingSummary,
  rateCourse,
  ratingSchema,
} from "~/lib/course-ratings.server";
import { renderMarkdown } from "~/lib/markdown.server";
import { resolveCountry } from "~/lib/country.server";
import { calculatePppPrice, getCountryTierInfo } from "~/lib/ppp";
import { parseFormData } from "~/lib/validation";
import { CourseContent } from "~/components/course-detail/course-content";
import { CourseDetailError } from "~/components/course-detail/course-detail-error";
import { CourseDetailSkeleton } from "~/components/course-detail/course-detail-skeleton";
import { CourseHero } from "~/components/course-detail/course-hero";
import { CourseSidebarCard } from "~/components/course-detail/course-sidebar-card";
import { EnrollOptions } from "~/components/course-detail/enroll-options";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Course";
  return [
    { title: `${title} — Cadence` },
    { name: "description", content: loaderData?.course?.description ?? "" },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  // Public page: signed-out visitors and people without an Enrollment still
  // see it.
  const decisions = await coursePermissions.getCourseDecisions(request, {
    slug: params.slug,
  });
  if (!decisions.found) {
    throw data("Course not found", { status: 404 });
  }
  const { course, person, enrolled, view, take } = decisions;
  const currentUserId = person?.id ?? null;
  const canView = view.allowed;
  const canTake = take.allowed;
  const countryLock =
    !take.allowed && take.reason.kind === "country-lock" ? take.reason : null;

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found", { status: 404 });
  }

  const lessonCount = getLessonCountForCourse(course.id);

  let progress = 0;
  const lessonProgressMap: Record<number, string> = {};
  let nextLessonId: number | null = null;
  let refundOffer: RefundOffer | null = null;

  if (person && enrolled) {
    refundOffer = getRefundOffer(db, person.id, course.id, new Date());
  }

  // Progress is shown only to someone who can take the course.
  if (person && canTake) {
    progress = calculateProgress(person.id, course.id, false);

    const progressRecords = getLessonProgressForCourse(person.id, course.id);
    for (const record of progressRecords) {
      lessonProgressMap[record.lessonId] = record.status;
    }

    const nextLesson = getNextIncompleteLesson(person.id, course.id);
    nextLessonId = nextLesson?.id ?? null;
  }

  // Render sales copy from Markdown to HTML server-side
  const salesCopyHtml = await renderMarkdown(courseWithDetails.salesCopy);

  const ratingSummary = getCourseRatingSummary(course.id);
  const userRating = currentUserId
    ? (findRating(currentUserId, course.id)?.rating ?? null)
    : null;

  const country = await resolveCountry(request);
  const pppPrice = courseWithDetails.pppEnabled
    ? calculatePppPrice(courseWithDetails.price, country)
    : courseWithDetails.price;
  const tierInfo = getCountryTierInfo(country);

  return {
    course: courseWithDetails,
    salesCopyHtml,
    lessonCount,
    enrolled,
    canView,
    canTake,
    countryLock,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
    ratingSummary,
    userRating,
    refundOffer,
  };
}

// Enrollment is handled via the purchase confirmation page — this action only
// records star ratings.
export async function action({ params, request }: Route.ActionArgs) {
  // Rating needs "take", so a Student under Country Lock can't rate.
  const { person, course } = await coursePermissions.requireCapability(
    request,
    "take",
    { slug: params.slug }
  );

  const formData = await request.formData();
  const parsed = parseFormData(formData, ratingSchema);

  if (!parsed.success) {
    return { ok: false as const, error: "Please choose a rating from 1 to 5." };
  }

  rateCourse(person.id, course.id, parsed.data.rating);

  return { ok: true as const, error: null };
}

export function HydrateFallback() {
  return <CourseDetailSkeleton />;
}

export default function CourseDetail({ loaderData }: Route.ComponentProps) {
  const {
    course,
    salesCopyHtml,
    lessonCount,
    enrolled,
    canView,
    canTake,
    countryLock,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
    ratingSummary,
    userRating,
    refundOffer,
  } = loaderData;
  const isInstructor = currentUserId === course.instructorId;
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("already_enrolled") === "1") {
      toast.info("You're already enrolled in this course.");
      setSearchParams(
        (prev) => {
          prev.delete("already_enrolled");
          return prev;
        },
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams]);

  const totalDuration = course.modules.reduce(
    (sum, mod) =>
      sum + mod.lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0),
    0
  );

  const selfPurchaseLink = currentUserId
    ? `/courses/${course.slug}/purchase`
    : `/signup?redirectTo=${encodeURIComponent(`/courses/${course.slug}/purchase`)}`;

  const teamPurchaseLink = currentUserId
    ? `/courses/${course.slug}/purchase?mode=team`
    : `/signup?redirectTo=${encodeURIComponent(`/courses/${course.slug}/purchase?mode=team`)}`;

  const enrollButton = (
    <EnrollOptions
      price={course.price}
      pppPrice={pppPrice}
      tierLabel={tierInfo.label}
      selfPurchaseLink={selfPurchaseLink}
      teamPurchaseLink={teamPurchaseLink}
    />
  );

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/courses" className="hover:text-foreground">
          Courses
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{course.title}</span>
      </nav>

      {/* Hero section */}
      <CourseHero
        course={course}
        isInstructor={isInstructor}
        ratingSummary={ratingSummary}
        lessonCount={lessonCount}
        totalDuration={totalDuration}
      />

      {/* Two-column: sales copy left, sidebar right */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: sales copy + course content */}
        <div className="lg:col-span-2">
          <div
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: salesCopyHtml }}
          />

          {/* Bottom CTA */}
          {!enrolled && !isInstructor && (
            <div className="mt-8 rounded-lg border bg-muted/50 p-6">
              <h3 className="mb-2 text-lg font-semibold">
                Ready to get started?
              </h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Join this course and start learning today.
              </p>
              {enrollButton}
            </div>
          )}

          <div className="mt-8">
            <CourseContent
              course={course}
              canView={canView}
              isInstructor={isInstructor}
              lessonProgressMap={lessonProgressMap}
            />
          </div>
        </div>

        {/* Right column: progress/enrollment card */}
        <div className="space-y-6">
          <CourseSidebarCard
            course={course}
            isInstructor={isInstructor}
            enrolled={enrolled}
            canTake={canTake}
            countryLock={countryLock}
            progress={progress}
            nextLessonId={nextLessonId}
            teamPurchaseLink={teamPurchaseLink}
            userRating={userRating}
            refundOffer={refundOffer}
            enrollOptions={enrollButton}
            lessonCount={lessonCount}
            totalDuration={totalDuration}
          />
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <CourseDetailError error={error} />;
}
