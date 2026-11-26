import { CheckCircle2, ChevronRight } from "lucide-react";
import { Link, type useFetcher } from "react-router";

import { Button } from "~/components/ui/button";

/** Mark Complete / Up Next, for an enrolled Student. */
export function LessonCompletion({
  courseSlug,
  nextLesson,
  isCompleted,
  isMarking,
  fetcher,
}: {
  courseSlug: string;
  nextLesson: { id: number; title: string } | null;
  isCompleted: boolean;
  isMarking: boolean;
  fetcher: ReturnType<typeof useFetcher>;
}) {
  return (
    <div className="mb-8">
      {isCompleted ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="size-5" />
            <span className="font-medium">Lesson completed</span>
          </div>
          {nextLesson && (
            <Link to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}>
              <Button variant="outline" size="sm">
                Up next: {nextLesson.title}
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </Link>
          )}
        </div>
      ) : nextLesson ? (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="mark-complete" />
          <Button disabled={isMarking}>
            {isMarking ? (
              "Completing..."
            ) : (
              <>
                Up next: {nextLesson.title}
                <ChevronRight className="ml-1 size-4" />
              </>
            )}
          </Button>
        </fetcher.Form>
      ) : (
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="mark-complete" />
          <Button disabled={isMarking}>
            <CheckCircle2 className="mr-2 size-4" />
            {isMarking ? "Marking..." : "Mark as Complete"}
          </Button>
        </fetcher.Form>
      )}
    </div>
  );
}
