import { db } from "~/db";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";
import {
  purchasingPowerPrice,
  type PricedCourse,
} from "./lib/purchasing-power-price";

export type { PricedCourse } from "./lib/purchasing-power-price";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Purchases bound to a database. The app uses `purchases`, which reads the
 * app database; tests build their own against a test database.
 */
export function createPurchases(_database: Db) {
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
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const purchases = /* @__PURE__ */ createPurchases(db);
