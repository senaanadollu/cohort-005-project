import { BookOpen, Clock, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { UserAvatar } from "~/components/user-avatar";
import { formatDuration } from "~/lib/utils";

import { EnrolledActions } from "./enrolled-actions";
import type { CountryLockNotice, CourseDetailSummary } from "./types";

/**
 * The sticky right-hand card: manage link for the Instructor, progress and
 * actions for an enrolled learner, enroll options for everyone else, then the
 * course facts.
 */
export function CourseSidebarCard({
  course,
  isInstructor,
  enrolled,
  canTake,
  countryLock,
  progress,
  nextLessonId,
  teamPurchaseLink,
  userRating,
  refundOffer,
  enrollOptions,
  lessonCount,
  totalDuration,
}: {
  course: CourseDetailSummary;
  isInstructor: boolean;
  enrolled: boolean;
  canTake: boolean;
  countryLock: CountryLockNotice | null;
  progress: number;
  nextLessonId: number | null;
  teamPurchaseLink: string;
  userRating: number | null;
  refundOffer: { purchaseId: number; amount: number } | null;
  enrollOptions: ReactNode;
  lessonCount: number;
  totalDuration: number;
}) {
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <h2 className="text-lg font-semibold">
          {isInstructor
            ? "Your Course"
            : enrolled
              ? "Your Progress"
              : "Get Started"}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInstructor ? (
          <Link to={`/instructor/${course.id}`}>
            <Button className="w-full">
              <Pencil className="mr-2 size-4" />
              Manage Course
            </Button>
          </Link>
        ) : enrolled ? (
          <EnrolledActions
            course={course}
            countryLock={countryLock}
            canTake={canTake}
            progress={progress}
            nextLessonId={nextLessonId}
            teamPurchaseLink={teamPurchaseLink}
            userRating={userRating}
            refundOffer={refundOffer}
          />
        ) : (
          enrollOptions
        )}
        <div className="space-y-2 pt-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4" />
            <span>{lessonCount} lessons</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="size-4" />
            <span>
              {formatDuration(totalDuration, true, false, false)} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <UserAvatar
              name={course.instructorName}
              avatarUrl={course.instructorAvatarUrl}
              className="size-5"
            />
            <span>Taught by {course.instructorName}</span>
          </div>
          {course.instructorBio && (
            <p className="mt-2 text-xs leading-relaxed">
              {course.instructorBio}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
