const MILESTONE_BASE_VALUES = [5, 10, 25] as const;
const FIRST_MILESTONE_SCALE = 1_000;
export const SUGAKO_APPEARANCE_RATE = 0.25;

export type MilestoneMascot = "james" | "sugako";

export function chooseMilestoneMascot(randomValue: number): MilestoneMascot {
  return randomValue < SUGAKO_APPEARANCE_RATE ? "sugako" : "james";
}

export function getScoreMilestone(index: number): number {
  const safeIndex = Math.max(0, Math.floor(index));
  const cycle = Math.floor(safeIndex / MILESTONE_BASE_VALUES.length);
  const baseValue =
    MILESTONE_BASE_VALUES[safeIndex % MILESTONE_BASE_VALUES.length] ?? 5;
  return baseValue * FIRST_MILESTONE_SCALE * 10 ** cycle;
}

export function findCrossedScoreMilestone(
  previousScore: number,
  currentScore: number,
): number | null {
  if (currentScore <= previousScore || currentScore < getScoreMilestone(0)) {
    return null;
  }

  let crossedMilestone: number | null = null;
  for (let index = 0; index < 30; index += 1) {
    const milestone = getScoreMilestone(index);
    if (milestone > currentScore) {
      break;
    }
    if (milestone > previousScore) {
      crossedMilestone = milestone;
    }
  }
  return crossedMilestone;
}

export class MilestoneCelebration {
  private previousScore = 0;
  private hideTimer: number | null = null;
  private showFromLeft = true;

  constructor(
    private readonly element: HTMLElement,
    private readonly scoreLabel: HTMLElement,
    private readonly announcement: HTMLElement,
    private readonly random: () => number = Math.random,
  ) {}

  update(score: number): void {
    const milestone = findCrossedScoreMilestone(this.previousScore, score);
    this.previousScore = score;

    if (milestone !== null) {
      this.show(milestone, chooseMilestoneMascot(this.random()));
    }
  }

  preview(milestone: number, mascot?: MilestoneMascot): void {
    this.show(
      Math.max(0, Math.floor(milestone)),
      mascot ?? chooseMilestoneMascot(this.random()),
    );
  }

  reset(): void {
    this.previousScore = 0;
    this.showFromLeft = true;
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.element.classList.remove(
      "james-celebration--visible",
      "james-celebration--left",
      "james-celebration--right",
      "james-celebration--james",
      "james-celebration--sugako",
    );
    this.announcement.textContent = "";
  }

  destroy(): void {
    this.reset();
  }

  private show(milestone: number, mascot: MilestoneMascot): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
    }

    const side = this.showFromLeft ? "left" : "right";
    this.showFromLeft = !this.showFromLeft;
    const formattedScore = milestone.toLocaleString("ja-JP");

    this.element.classList.remove(
      "james-celebration--visible",
      "james-celebration--left",
      "james-celebration--right",
      "james-celebration--james",
      "james-celebration--sugako",
    );
    void this.element.offsetWidth;
    this.scoreLabel.textContent = formattedScore;
    const mascotName = mascot === "sugako" ? "スガーコ" : "ジェームスくん";
    this.announcement.textContent = `${formattedScore}点を突破。${mascotName}が応援に来ました。`;
    this.element.classList.add(
      `james-celebration--${side}`,
      `james-celebration--${mascot}`,
      "james-celebration--visible",
    );

    this.hideTimer = window.setTimeout(() => {
      this.element.classList.remove("james-celebration--visible");
      this.hideTimer = null;
    }, 3_400);
  }
}
