import { FullLesson } from "~/components/lesson/full-lesson";
import { LessonError } from "~/components/lesson/lesson-error";
import { LockedLesson } from "~/components/lesson/locked-lesson";
import { lessonPage } from "~/modules/lesson-page/index.server";

import type { Route } from "./+types/courses.$slug.lessons.$lessonId";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.lesson?.title ?? "Lesson";
  const courseTitle = loaderData?.course?.title ?? "Course";
  return [{ title: `${title} — ${courseTitle} — Cadence` }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return lessonPage.load(params, request);
}

export async function action({ params, request }: Route.ActionArgs) {
  return lessonPage.act(params, request);
}

export default function LessonViewer({ loaderData }: Route.ComponentProps) {
  if (loaderData.view === "locked") {
    return <LockedLesson data={loaderData} />;
  }
  return <FullLesson data={loaderData} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <LessonError error={error} />;
}
