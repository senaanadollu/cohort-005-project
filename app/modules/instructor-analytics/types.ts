// The shapes of the instructor analytics figures, and nothing else. Types
// only, so components rendering those figures can import them without
// reaching for the `.server` entry point.

export type { InstructorAnalytics } from "./lib/instructor-analytics";
export type { TopBuyer } from "./lib/audience";
export type { CourseCountryRevenue } from "./lib/country-revenue";
export type {
  CourseFunnel,
  CourseProgressSummary,
  FunnelLesson,
} from "./lib/course-progress";
export type { QuizPassRate } from "./lib/quiz-pass-rates";
export type { RefundExposure } from "./lib/refund-exposure";
export type { RevenueSeries } from "./lib/revenue";
