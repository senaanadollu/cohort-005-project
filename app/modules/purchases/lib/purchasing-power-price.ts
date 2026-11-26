import { getDiscountForCountry } from "~/lib/ppp";

/** The parts of a course its Purchasing-Power Price depends on. */
export type PricedCourse = { price: number; pppEnabled: boolean };

export function purchasingPowerPrice(
  course: PricedCourse,
  country: string | null
): number {
  if (!course.pppEnabled) return course.price;
  return Math.round(course.price * (1 - getDiscountForCountry(country)));
}
