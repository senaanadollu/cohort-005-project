import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "~/test/setup";
import { createPurchases } from "../index.server";

let purchases: ReturnType<typeof createPurchases>;

beforeEach(() => {
  purchases = createPurchases(createTestDb());
});

describe("Purchasing-Power Price", () => {
  it("is the full price when the course has purchasing-power pricing switched off", () => {
    expect(
      purchases.purchasingPowerPrice({ price: 4999, pppEnabled: false }, "IN")
    ).toBe(4999);
  });

  it("is the full price when the buyer's country is unknown", () => {
    expect(
      purchases.purchasingPowerPrice({ price: 4999, pppEnabled: true }, null)
    ).toBe(4999);
  });

  it("is the full price in a full-price country", () => {
    expect(
      purchases.purchasingPowerPrice({ price: 4999, pppEnabled: true }, "US")
    ).toBe(4999);
  });

  it("is the full price in a country with no tier", () => {
    expect(
      purchases.purchasingPowerPrice({ price: 4999, pppEnabled: true }, "XX")
    ).toBe(4999);
  });

  it("is nothing for a free course in any country", () => {
    expect(
      purchases.purchasingPowerPrice({ price: 0, pppEnabled: true }, "IN")
    ).toBe(0);
  });

  // 4999 cents discounted: 30% → 3499.3, 50% → 2499.5, 70% → 1499.7,
  // each rounded once to the nearest whole cent.
  it.each([
    ["30%", "BR", 3499],
    ["50%", "IN", 2500],
    ["70%", "NG", 1500],
  ])(
    "is discounted by %s and rounded once to whole cents in %s",
    (_label, country, expected) => {
      expect(
        purchases.purchasingPowerPrice({ price: 4999, pppEnabled: true }, country)
      ).toBe(expected);
    }
  );
});
