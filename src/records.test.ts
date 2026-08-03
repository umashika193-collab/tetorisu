import { describe, expect, it } from "vitest";

import { PersonalBestStore, type GameRecord } from "./records";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const record = (score: number): GameRecord => ({
  score,
  lines: score / 100,
  level: 2,
  elapsedSeconds: 75,
});

describe("PersonalBestStore", () => {
  it("初回は得点0の空記録を返す", () => {
    const store = new PersonalBestStore(new MemoryStorage());

    expect(store.load()).toEqual({
      score: 0,
      lines: 0,
      level: 1,
      elapsedSeconds: 0,
    });
  });

  it("以前より高い得点を自己ベストとして保存する", () => {
    const storage = new MemoryStorage();
    const store = new PersonalBestStore(storage);

    expect(store.saveIfBest(record(800)).isNewBest).toBe(true);
    expect(new PersonalBestStore(storage).load()).toEqual(record(800));
  });

  it("同点または低い得点では記録を置き換えない", () => {
    const store = new PersonalBestStore(new MemoryStorage());
    store.saveIfBest(record(800));

    expect(store.saveIfBest(record(800)).isNewBest).toBe(false);
    expect(store.saveIfBest(record(300)).best.score).toBe(800);
    expect(store.load().score).toBe(800);
  });

  it("壊れた保存値は安全に無視する", () => {
    const storage = new MemoryStorage();
    storage.setItem("tetorisu:personal-best", "not-json");

    expect(new PersonalBestStore(storage).load().score).toBe(0);
  });
});
