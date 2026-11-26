// Entry point for `npm run db:seed`. Each section of seed data lives in
// scripts/seed/; this file only runs them in order. The order matters: later
// sections read ids that earlier sections insert, and the generated history
// consumes a seeded PRNG in a fixed sequence.
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { seedCategories } from "./seed/categories";
import { db, dropAllTables, migrationsFolder } from "./seed/database";
import { seedEnrollmentsAndRatings } from "./seed/enrollments-and-ratings";
import { seedGeneratedHistory } from "./seed/generated-history";
import { seedLessonComments } from "./seed/lesson-comments";
import { seedLessonProgress } from "./seed/lesson-progress";
import { seedPurchasesAndTeams } from "./seed/purchases-and-teams";
import { seedQuizAttempts } from "./seed/quiz-attempts";
import { seedQuizzes } from "./seed/quizzes";
import { seedRefundRequests } from "./seed/refund-requests";
import { printSummaryAndSyncKnock } from "./seed/summary";
import { seedFurtherTeamPurchases } from "./seed/team-licences";
import { seedUsers } from "./seed/users";
import {
  flushWatchEvents,
  seedNarrativeWatchSessions,
} from "./seed/watch-events";
import { seedDesignSystemsWithTailwind } from "./seed/courses/design-systems-with-tailwind";
import { seedDockerAndKubernetes } from "./seed/courses/docker-and-kubernetes";
import { seedIntroductionToTypescript } from "./seed/courses/introduction-to-typescript";
import { seedPracticalDataVisualisation } from "./seed/courses/practical-data-visualisation";
import { seedRestApisWithNodejs } from "./seed/courses/rest-apis-with-nodejs";

async function seed() {
  console.log("Seeding database...");

  dropAllTables();

  // Create tables using the same Drizzle migrations as the live database
  migrate(db, { migrationsFolder });

  console.log("Tables created.");

  const {
    admin,
    instructor1,
    instructor2,
    students,
    bossy,
    cohort,
    studentByEmail,
  } = seedUsers();

  const { catBySlug } = seedCategories();

  const { course: course1, lessonIds: course1LessonIds } =
    seedIntroductionToTypescript(instructor1, catBySlug);
  const { course: course2, lessonIds: course2LessonIds } =
    seedRestApisWithNodejs(instructor2, catBySlug);
  const { course: course3, lessonIds: course3LessonIds } =
    seedDesignSystemsWithTailwind(instructor1, catBySlug);
  seedPracticalDataVisualisation(instructor2, catBySlug);
  seedDockerAndKubernetes(instructor2, catBySlug);

  const quizzes = seedQuizzes(course1LessonIds, course2LessonIds);

  seedEnrollmentsAndRatings(students, course1, course2);
  seedLessonComments(
    students,
    admin,
    instructor1,
    instructor2,
    course1LessonIds,
    course2LessonIds
  );
  seedLessonProgress(students, course1LessonIds, course2LessonIds);
  seedQuizAttempts(students, quizzes);
  seedNarrativeWatchSessions(students, course1LessonIds, course2LessonIds);
  seedPurchasesAndTeams(students, bossy, course1, course2, studentByEmail);

  seedGeneratedHistory(
    cohort,
    course1,
    course2,
    course3,
    course1LessonIds,
    course2LessonIds,
    course3LessonIds
  );

  const { novakLicence } = seedFurtherTeamPurchases(
    course1,
    course3,
    studentByEmail
  );

  seedRefundRequests(course1, course1LessonIds, novakLicence, studentByEmail);

  flushWatchEvents();

  await printSummaryAndSyncKnock();
}

seed().catch(console.error);
