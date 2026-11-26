import { db } from "~/db";
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
import type { Db } from "./lib/db";

export type { PricedCourse } from "./lib/purchasing-power-price";
export type { CountryCheck } from "./lib/country-check";
export type {
  IndividualPurchaseResult,
  PurchaseRefusal,
  TeamLicenceRefusal,
  TeamLicenceResult,
} from "./lib/buy";

/**
 * Purchases bound to a database. The app uses `purchases`, which reads the
 * app database; tests build their own against a test database.
 */
export function createPurchases(database: Db) {
  return {
    /**
     * What a course costs a buyer in `country`, in whole cents, rounded once
     * (ADR 0005). An unknown country (`null`) pays the full price (ADR 0012).
     * Reads no database: pass the course values you already hold.
     */
    purchasingPowerPrice(course: PricedCourse, country: string | null) {
      return purchasingPowerPrice(course, country);
    },

    /**
     * Records an Individual Purchase and the Enrollment it grants, together
     * or not at all, then tells the course's Instructor. A Notification
     * failure is logged and never fails the purchase. The charge is read
     * inside the transaction, never taken from the caller.
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
     * Records a Team Licence, the Team Admin's team and its Seats, together
     * or not at all. The buyer gets no Enrollment, so nothing is sent, and an
     * enrolled buyer may still buy one.
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
     * country they are in now (ADR 0009). Only the Student's newest standing
     * Individual Purchase counts, so a Student enrolled through a Claimed
     * Seat is never blocked (ADR 0013). The staff exemption is the caller's
     * to apply.
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
