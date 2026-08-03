import { describe, expect, it } from "vitest";

import {
  createShape,
  getSrsKickOffsets,
  rotateClockwise,
  rotateCounterClockwise,
  TETROMINO_KINDS,
} from "./tetrominoes";

describe("tetrominoes", () => {
  it("7種類すべてが4マスで構成される", () => {
    for (const kind of TETROMINO_KINDS) {
      const occupiedCells = createShape(kind)
        .flat()
        .filter((cell) => cell === 1);

      expect(occupiedCells).toHaveLength(4);
    }
  });

  it("形状を時計回りに90度回転する", () => {
    expect(
      rotateClockwise([
        [1, 0],
        [1, 1],
      ]),
    ).toEqual([
      [1, 1],
      [1, 0],
    ]);
  });

  it("4回転すると元の形状に戻る", () => {
    const original = createShape("T");
    let rotated = original;

    for (let count = 0; count < 4; count += 1) {
      rotated = rotateClockwise(rotated);
    }

    expect(rotated).toEqual(original);
  });

  it("反時計回りに90度回転する", () => {
    expect(
      rotateCounterClockwise([
        [1, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("SRSの回転方向とミノ種別に応じたキック候補を返す", () => {
    expect(getSrsKickOffsets("T", 0, 1)).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: 2 },
      { x: -1, y: 2 },
    ]);
    expect(getSrsKickOffsets("I", 0, 1)[1]).toEqual({ x: -2, y: 0 });
    expect(getSrsKickOffsets("O", 0, 1)).toEqual([{ x: 0, y: 0 }]);
  });
});
