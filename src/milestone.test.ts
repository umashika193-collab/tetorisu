import { describe, expect, it } from "vitest";
import {
  chooseMilestoneMascot,
  findCrossedScoreMilestone,
  getScoreMilestone,
  SUGAKO_APPEARANCE_RATE,
} from "./milestone";

describe("chooseMilestoneMascot", () => {
  it("selects Sugako for the first 25 percent of the random range", () => {
    expect(SUGAKO_APPEARANCE_RATE).toBe(0.25);
    expect(chooseMilestoneMascot(0)).toBe("sugako");
    expect(chooseMilestoneMascot(0.249_999)).toBe("sugako");
    expect(chooseMilestoneMascot(0.25)).toBe("james");
    expect(chooseMilestoneMascot(0.999_999)).toBe("james");
  });
});

describe("getScoreMilestone", () => {
  it("widens the celebration interval as the score grows", () => {
    expect(Array.from({ length: 8 }, (_, index) => getScoreMilestone(index))).toEqual([
      5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000,
    ]);
  });
});

describe("findCrossedScoreMilestone", () => {
  it("returns the milestone when the score crosses a celebration boundary", () => {
    expect(findCrossedScoreMilestone(4_900, 5_000)).toBe(5_000);
    expect(findCrossedScoreMilestone(9_750, 10_050)).toBe(10_000);
    expect(findCrossedScoreMilestone(20_000, 26_000)).toBe(25_000);
  });

  it("returns the highest crossed milestone after a large score jump", () => {
    expect(findCrossedScoreMilestone(4_800, 26_200)).toBe(25_000);
  });

  it("does not repeat a milestone or react to a restart", () => {
    expect(findCrossedScoreMilestone(5_000, 5_200)).toBeNull();
    expect(findCrossedScoreMilestone(5_200, 0)).toBeNull();
  });
});
