import { db } from "~/db";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";
import {
  purchasingPowerPrice,
  type PricedCourse,
} from "./lib/purchasing-power-price";
import {
  buyIndividualPurchase,
  buyTeamLicence,
  type IndividualPurchaseResult,
  type TeamLicenceResult,
} from "./lib/buy";
import { countryCheck, type CountryCheck } from "./lib/country-check";
import type { Notifications } from "~/lib/notifications.server";

export type { PricedCourse } from "./lib/purchasing-power-price";
export type { CountryCheck } from "./lib/country-check";
export type {
  IndividualPurchaseResult,
  PurchaseRefusal,
  TeamLicenceRefusal,
  TeamLicenceResult,
} from "./lib/buy";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Purchases bound to a database. The app uses `purchases`, which reads the
 * app database; tests build their own against a test database.
 */
export function createPurchases(database: Db) {
  return {
    /**
     * What a course costs a buyer in `country`, in whole cents.
     *
     * The full price when the course has purchasing-power pricing switched
     * off or the country is unknown (`null`, ADR 0012); otherwise the price
     * discounted for the country's tier, rounded once (ADR 0005). Reads no
     * database: pass the course values you already hold.
     */
    purchasingPowerPrice(course: PricedCourse, country: string | null) {
      return purchasingPowerPrice(course, country);
    },

    /**
     * Records an Individual Purchase and the Enrollment it grants, together
     * or not at all, then tells the course's Instructor. A Notification
     * failure is logged and never fails the purchase.
     *
     * The charge is the course's Purchasing-Power Price for `country`, read
     * inside the transaction. `country` (or `null` when unknown) and `now`
     * are stamped on the Purchase; the Enrollment starts at `now` too.
     * Refused with nothing recorded when the course does not exist, is not
     * Published, or the Student is already enrolled.
     */
    buyIndividualPurchase(
      studentId: number,
      courseId: number,
      country: string | null,
      now: Date,
      notifications: Notifications
    ): Promise<IndividualPurchaseResult> {
      return buyIndividualPurchase(
        database,
        studentId,
        courseId,
        country,
        now,
        notifications
      );
    },

    /**
     * Records a Team Licence of `seats` Seats, the Team Admin's team (found,
     * or created with the buyer as its Team Admin) and every Seat, together
     * or not at all. The buyer gets no Enrollment, so nothing is sent; an
     * enrolled buyer may still buy one.
     *
     * The charge is the per-Seat Purchasing-Power Price for `country` times
     * `seats`. Refused with nothing recorded when the course does not exist,
     * is not Published, or `seats` is not a whole number of at least 1.
     */
    buyTeamLicence(
      teamAdminId: number,
      courseId: number,
      seats: number,
      country: string | null,
      now: Date
    ): Promise<TeamLicenceResult> {
      return buyTeamLicence(database, teamAdminId, courseId, seats, country, now);
    },

    /**
     * Whether a Student is blocked from playing a course in `country`, the
     * country they are in now (`null` when unknown). Reads the Student's
     * standing Individual Purchase only: bought by them, granting no Seats,
     * with no Approved Refund Request; the newest if there are several.
     *
     * Blocked only when that Purchase was made at a Purchasing-Power Price
     * below the full price, in a country other than `country` (ADR 0009).
     * Never blocked when there is no such Purchase (a Student enrolled
     * through a Claimed Seat, ADR 0013), the Purchase has no country, the
     * course has purchasing-power pricing switched off, or `country` is
     * unknown. The staff exemption is the caller's to apply.
     */
    countryCheck(
      studentId: number,
      courseId: number,
      country: string | null
    ): CountryCheck {
      return countryCheck(database, studentId, courseId, country);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const purchases = /* @__PURE__ */ createPurchases(db);
