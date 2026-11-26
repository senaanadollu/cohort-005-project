import { describe, it, expect, beforeEach } from "vitest";
import {
  addUser,
  asInstructor,
  buy,
  course,
  otherCourse,
  setUpAnalyticsFixtures,
} from "./fixtures";

beforeEach(setUpAnalyticsFixtures);

describe("revenue by country", () => {
  function countries(params: Record<string, string> = {}) {
    return asInstructor({ course: String(course.id), ...params }).countries;
  }

  it("breaks sales down by country, biggest first, with parity discounts", () => {
    const student = addUser("Student");
    buy(student.id, course.id, 10000, { country: "US" });
    buy(student.id, course.id, 10000, { country: "US" });
    buy(student.id, course.id, 8000, { country: null });
    buy(student.id, course.id, 5000, { country: "IN" });
    buy(student.id, course.id, 3000, { country: "NG" });

    expect(countries()).toEqual({
      grossCents: 36000,
      netCents: 28800,
      purchaseCount: 5,
      discountedGrossCents: 8000,
      discountedNetCents: 6400,
      discountedSharePercent: 22,
      rows: [
        {
          country: "US",
          purchaseCount: 2,
          grossCents: 20000,
          netCents: 16000,
          sharePercent: 56,
          averagePaidCents: 10000,
          discountPercent: 0,
        },
        {
          country: null,
          purchaseCount: 1,
          grossCents: 8000,
          netCents: 6400,
          sharePercent: 22,
          averagePaidCents: 8000,
          discountPercent: null,
        },
        {
          country: "IN",
          purchaseCount: 1,
          grossCents: 5000,
          netCents: 4000,
          sharePercent: 14,
          averagePaidCents: 5000,
          discountPercent: 50,
        },
        {
          country: "NG",
          purchaseCount: 1,
          grossCents: 3000,
          netCents: 2400,
          sharePercent: 8,
          averagePaidCents: 3000,
          discountPercent: 70,
        },
      ],
    });
  });

  it("only counts this course's sales inside the range", () => {
    const student = addUser("Student");
    buy(student.id, course.id, 1000, { daysBack: 2 });
    buy(student.id, course.id, 2000, { daysBack: 40 });
    buy(student.id, otherCourse.id, 4000, { daysBack: 2 });

    expect(countries({ range: "30d" })?.grossCents).toBe(1000);
    expect(countries({ range: "all" })?.grossCents).toBe(3000);
  });

  it("is all zeroes with no sales", () => {
    expect(countries()).toEqual({
      grossCents: 0,
      netCents: 0,
      purchaseCount: 0,
      discountedGrossCents: 0,
      discountedNetCents: 0,
      discountedSharePercent: 0,
      rows: [],
    });
  });
});
