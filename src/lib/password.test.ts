import { describe, it, expect } from "vitest";
import { isStrongPassword, isFutureSchedule } from "./password";

describe("password rules", () => {
  it("rejects under 8 chars", () => expect(isStrongPassword("Ab1defg")).toBe(false));
  it("requires uppercase, lowercase and number", () => {
    expect(isStrongPassword("abcdefg1")).toBe(false);
    expect(isStrongPassword("ABCDEFG1")).toBe(false);
    expect(isStrongPassword("Abcdefgh")).toBe(false);
    expect(isStrongPassword("Abcdefg1")).toBe(true);
  });
});

describe("schedule", () => {
  const now = new Date("2026-01-01T10:00:00Z");
  it("rejects past or now", () => expect(isFutureSchedule(new Date("2026-01-01T10:00:00Z"), now)).toBe(false));
  it("accepts future", () => expect(isFutureSchedule(new Date("2026-01-01T10:05:00Z"), now)).toBe(true));
});
