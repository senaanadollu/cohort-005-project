// Prop shapes shared by the course detail components. They are structural
// subsets of what the course detail loader returns, so these components never
// import server code.

export type CourseDetailLesson = {
  id: number;
  title: string;
  durationMinutes: number | null;
};

export type CourseDetailModule = {
  id: number;
  title: string;
  lessons: Array<CourseDetailLesson>;
};

/** What the Course Content list needs to render modules and lessons. */
export type CourseContentCourse = {
  id: number;
  slug: string;
  modules: Array<CourseDetailModule>;
};

/** What the hero and the sidebar card need to describe the course. */
export type CourseDetailSummary = CourseContentCourse & {
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  categoryName: string;
  instructorId: number;
  instructorName: string;
  instructorAvatarUrl: string | null;
  instructorBio: string | null;
  price: number;
};

export type CountryLockNotice = {
  purchaseCountry: string;
  currentCountry: string;
};
