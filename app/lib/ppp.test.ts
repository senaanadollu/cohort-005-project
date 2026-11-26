import { describe, it, expect } from "vitest";
import {
  getTierForCountry,
  getDiscountForCountry,
  getCountryTierInfo,
} from "./ppp";

describe("PPP Config", () => {
  // ─── Tier Mapping ───

  describe("getTierForCountry", () => {
    it("returns tier 1 for US", () => {
      expect(getTierForCountry("US")).toBe(1);
    });

    it("returns tier 2 for Poland", () => {
      expect(getTierForCountry("PL")).toBe(2);
    });

    it("returns tier 3 for India", () => {
      expect(getTierForCountry("IN")).toBe(3);
    });

    it("returns tier 4 for Nigeria", () => {
      expect(getTierForCountry("NG")).toBe(4);
    });

    it("returns tier 1 for unmapped countries", () => {
      expect(getTierForCountry("XX")).toBe(1);
      expect(getTierForCountry("ZZ")).toBe(1);
    });

    it("returns tier 1 for null", () => {
      expect(getTierForCountry(null)).toBe(1);
    });

    it("is case-insensitive", () => {
      expect(getTierForCountry("in")).toBe(3);
      expect(getTierForCountry("Us")).toBe(1);
    });
  });

  // ─── Discount ───

  describe("getDiscountForCountry", () => {
    it("returns 0 for tier 1 countries", () => {
      expect(getDiscountForCountry("US")).toBe(0);
    });

    it("returns 0.3 for tier 2 countries", () => {
      expect(getDiscountForCountry("BR")).toBe(0.3);
    });

    it("returns 0.5 for tier 3 countries", () => {
      expect(getDiscountForCountry("IN")).toBe(0.5);
    });

    it("returns 0.7 for tier 4 countries", () => {
      expect(getDiscountForCountry("NG")).toBe(0.7);
    });

    it("returns 0 for null country", () => {
      expect(getDiscountForCountry(null)).toBe(0);
    });
  });

  // ─── Tier Info ───

  describe("getCountryTierInfo", () => {
    it("returns tier, discount, and label", () => {
      const info = getCountryTierInfo("IN");
      expect(info).toEqual({ tier: 3, discount: 0.5, label: "50% off" });
    });

    it("returns full price info for null", () => {
      const info = getCountryTierInfo(null);
      expect(info).toEqual({ tier: 1, discount: 0, label: "Full Price" });
    });
  });
});
