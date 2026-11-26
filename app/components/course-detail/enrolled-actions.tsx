import { PlayCircle, ShieldAlert, Users } from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { countryName } from "~/lib/ppp";

import { RateCourse } from "./rate-course";
import { RequestRefund } from "./request-refund";
import type { CountryLockNotice, CourseDetailModule } from "./types";

/**
 * What an enrolled learner sees in the sidebar card: any Country Lock notice,
 * their progress and a link into the next lesson, more seats, rating and
 * refund.
 */
export function EnrolledActions({
  course,
  countryLock,
  canTake,
  progress,
  nextLessonId,
  teamPurchaseLink,
  userRating,
  refundOffer,
}: {
  course: { slug: string; modules: Array<CourseDetailModule> };
  countryLock: CountryLockNotice | null;
  canTake: boolean;
  progress: number;
  nextLessonId: number | null;
  teamPurchaseLink: string;
  userRating: number | null;
  refundOffer: { purchaseId: number; amount: number } | null;
}) {
  return (
    <>
      {countryLock && (
        <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p>
            You bought this course at a Purchasing-Power Price in{" "}
            <strong>{countryName(countryLock.purchaseCountry)}</strong>, so it
            can&apos;t be used from{" "}
            <strong>{countryName(countryLock.currentCountry)}</strong>.
          </p>
        </div>
      )}
      {canTake && (
        <>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{progress}% complete</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {course.modules.length > 0 &&
            (() => {
              const targetLessonId =
                nextLessonId ?? course.modules[0].lessons[0]?.id;
              return targetLessonId ? (
                <Link to={`/courses/${course.slug}/lessons/${targetLessonId}`}>
                  <Button className="w-full">
                    <PlayCircle className="mr-2 size-4" />
                    {progress > 0 ? "Continue Learning" : "Start Course"}
                  </Button>
                </Link>
              ) : null;
            })()}
        </>
      )}
      <Link to={teamPurchaseLink}>
        <Button variant="outline" className="w-full">
          <Users className="mr-2 size-4" />
          Buy More Seats
        </Button>
      </Link>
      {canTake && <RateCourse userRating={userRating} />}
      {refundOffer && (
        <RequestRefund
          slug={course.slug}
          purchaseId={refundOffer.purchaseId}
          amount={refundOffer.amount}
        />
      )}
    </>
  );
}
