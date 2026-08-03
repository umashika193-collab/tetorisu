import { TETROMINO_KINDS } from "./tetrominoes";
import type { TetrominoKind } from "./types";

export class SevenBag {
  private queue: TetrominoKind[] = [];

  public constructor(private readonly random: () => number = Math.random) {}

  public reset(): void {
    this.queue = [];
  }

  public take(): TetrominoKind {
    if (this.queue.length === 0) {
      this.refill();
    }

    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error("7バッグからミノを取得できませんでした。");
    }
    return next;
  }

  private refill(): void {
    this.queue = [...TETROMINO_KINDS];

    for (let index = this.queue.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      const current = this.queue[index];
      const replacement = this.queue[swapIndex];

      if (current !== undefined && replacement !== undefined) {
        this.queue[index] = replacement;
        this.queue[swapIndex] = current;
      }
    }
  }
}
