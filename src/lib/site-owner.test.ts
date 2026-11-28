import { describe, expect, it } from "vitest";
import { isOwnerEmail } from "./site-owner";
import { scoreTone } from "./gradebook/scores";

describe("personal website lock", () => {
  it("lets only the owner's accounts in", () => {
    expect(isOwnerEmail("tracongtaha@gmail.com")).toBe(true);
    expect(isOwnerEmail(" NguyenNgocKhanhBang1901@gmail.com ")).toBe(true);
    expect(isOwnerEmail("trongnguyenphamdinh@gmail.com")).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });
});

describe("score colours", () => {
  it("red under 5, dark red under 3.5", () => {
    expect(scoreTone(5)).toBe("");
    expect(scoreTone(4.9)).toBe("low");
    expect(scoreTone(3.5)).toBe("low");
    expect(scoreTone(3.4)).toBe("very_low");
    expect(scoreTone(null)).toBe("");
  });
});
