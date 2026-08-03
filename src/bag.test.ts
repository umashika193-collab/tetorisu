import { describe, expect, it } from "vitest";

import { SevenBag } from "./bag";
import { TETROMINO_KINDS } from "./tetrominoes";

describe("SevenBag", () => {
  it("7個ごとに全種類のミノを1つずつ返す", () => {
    const bag = new SevenBag(() => 0.42);
    const firstBag = Array.from({ length: 7 }, () => bag.take());
    const secondBag = Array.from({ length: 7 }, () => bag.take());
    const expectedKinds = [...TETROMINO_KINDS].sort();

    expect([...firstBag].sort()).toEqual(expectedKinds);
    expect([...secondBag].sort()).toEqual(expectedKinds);
  });

  it("リセット後は新しい7バッグから取り出す", () => {
    let calls = 0;
    const bag = new SevenBag(() => {
      calls += 1;
      return 0.25;
    });

    bag.take();
    const callsBeforeReset = calls;
    bag.reset();
    bag.take();

    expect(calls).toBeGreaterThan(callsBeforeReset);
  });
});
