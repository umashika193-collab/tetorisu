import { describe, expect, it } from "vitest";

import {
  calculateFallInterval,
  calculateLineClearScore,
  clearCompletedLines,
  FallingBlockGame,
} from "./game";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FALL_INTERVAL_MS,
  LINE_CLEAR_ANIMATION_MS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  MIN_FALL_INTERVAL_MS,
  type Cell,
} from "./types";

const deterministicRandom = (): number => 0.999_999;

describe("FallingBlockGame", () => {
  it("10列×20行の空盤面を作成する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    const { board } = game.getSnapshot();

    expect(board).toHaveLength(BOARD_HEIGHT);
    expect(board.every((row) => row.length === BOARD_WIDTH)).toBe(true);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });

  it("経過時間が落下間隔へ達すると1マス落下する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    const initialY = game.getSnapshot().activePiece.position.y;

    game.update(FALL_INTERVAL_MS - 1);
    expect(game.getSnapshot().activePiece.position.y).toBe(initialY);

    game.update(1);
    expect(game.getSnapshot().activePiece.position.y).toBe(initialY + 1);
  });

  it("左右の盤面外へ移動しない", () => {
    const game = new FallingBlockGame(deterministicRandom);

    for (let count = 0; count < BOARD_WIDTH * 2; count += 1) {
      game.moveLeft();
    }
    expect(game.getSnapshot().activePiece.position.x).toBe(0);

    for (let count = 0; count < BOARD_WIDTH * 2; count += 1) {
      game.moveRight();
    }
    expect(game.getSnapshot().activePiece.position.x).toBe(BOARD_WIDTH - 4);
  });

  it("ハードドロップでミノを固定して次のミノを出現させる", () => {
    const game = new FallingBlockGame(deterministicRandom);
    const firstKind = game.getSnapshot().activePiece.kind;

    game.hardDrop();
    const snapshot = game.getSnapshot();

    expect(snapshot.fixedPieces).toBe(1);
    expect(snapshot.board.flat().filter((cell) => cell === firstKind)).toHaveLength(4);
    expect(snapshot.activePiece.kind).not.toBe(firstKind);
  });

  it("ゴースト位置がハードドロップの着地点と一致する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    const { activePiece, ghostPosition } = game.getSnapshot();
    const expectedCells: { x: number; y: number }[] = [];

    activePiece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value === 1) {
          expectedCells.push({ x: ghostPosition.x + x, y: ghostPosition.y + y });
        }
      });
    });

    expect(ghostPosition.y).toBeGreaterThan(activePiece.position.y);
    game.hardDrop();

    const { board } = game.getSnapshot();
    expectedCells.forEach(({ x, y }) => {
      expect(board[y]?.[x]).toBe(activePiece.kind);
    });
  });

  it("1ミノにつき1回だけホールドし、固定後に再使用できる", () => {
    const game = new FallingBlockGame(deterministicRandom);
    const initial = game.getSnapshot();
    const firstKind = initial.activePiece.kind;
    const secondKind = initial.nextKind;

    game.hold();
    let snapshot = game.getSnapshot();
    expect(snapshot.heldKind).toBe(firstKind);
    expect(snapshot.activePiece.kind).toBe(secondKind);
    expect(snapshot.canHold).toBe(false);

    game.hold();
    snapshot = game.getSnapshot();
    expect(snapshot.heldKind).toBe(firstKind);
    expect(snapshot.activePiece.kind).toBe(secondKind);

    game.hardDrop();
    snapshot = game.getSnapshot();
    expect(snapshot.canHold).toBe(true);
    const outgoingKind = snapshot.activePiece.kind;

    game.hold();
    snapshot = game.getSnapshot();
    expect(snapshot.activePiece.kind).toBe(firstKind);
    expect(snapshot.heldKind).toBe(outgoingKind);
    expect(snapshot.activePiece.rotation).toBe(0);
  });

  it("IミノをSRSで壁からキックして回転する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    expect(game.getSnapshot().activePiece.kind).toBe("I");

    game.rotateClockwise();
    for (let count = 0; count < BOARD_WIDTH; count += 1) {
      game.moveLeft();
    }

    expect(game.getSnapshot().activePiece.position.x).toBe(-2);
    game.rotateClockwise();

    const snapshot = game.getSnapshot();
    expect(snapshot.activePiece.rotation).toBe(2);
    expect(snapshot.activePiece.position.x).toBe(0);
  });

  it("左右両方向へ回転できる", () => {
    const game = new FallingBlockGame(deterministicRandom);

    game.rotateCounterClockwise();
    expect(game.getSnapshot().activePiece.rotation).toBe(3);

    game.rotateClockwise();
    expect(game.getSnapshot().activePiece.rotation).toBe(0);
  });

  it("接地後もロックディレイ中は操作でき、500ms後に固定する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    game.getSnapshot().activePiece.position.y = BOARD_HEIGHT - 2;

    game.update(LOCK_DELAY_MS - 100);
    expect(game.getSnapshot().fixedPieces).toBe(0);

    game.moveLeft();
    expect(game.getSnapshot().lockDelayProgress).toBe(0);

    game.update(LOCK_DELAY_MS - 1);
    expect(game.getSnapshot().fixedPieces).toBe(0);

    game.update(1);
    expect(game.getSnapshot().fixedPieces).toBe(1);
  });

  it("ロックディレイのリセット回数に上限がある", () => {
    const game = new FallingBlockGame(deterministicRandom);
    game.getSnapshot().activePiece.position.y = BOARD_HEIGHT - 2;

    for (let count = 0; count < MAX_LOCK_RESETS; count += 1) {
      game.update(LOCK_DELAY_MS - 1);
      if (count % 2 === 0) {
        game.moveLeft();
      } else {
        game.moveRight();
      }
      expect(game.getSnapshot().fixedPieces).toBe(0);
    }

    game.update(LOCK_DELAY_MS - 100);
    game.moveRight();
    game.update(100);
    expect(game.getSnapshot().fixedPieces).toBe(1);
  });

  it("完成したラインを消去して上の行を繰り下げる", () => {
    const board = Array.from({ length: BOARD_HEIGHT }, () =>
      Array<Cell>(BOARD_WIDTH).fill(null),
    );
    const bottomRow = board[BOARD_HEIGHT - 1];
    const rowAbove = board[BOARD_HEIGHT - 2];
    if (bottomRow === undefined || rowAbove === undefined) {
      throw new Error("テスト盤面を作成できませんでした。");
    }

    bottomRow.fill("I");
    rowAbove[2] = "T";

    expect(clearCompletedLines(board)).toBe(1);
    expect(board[BOARD_HEIGHT - 1]?.[2]).toBe("T");
    expect(board[BOARD_HEIGHT - 2]?.every((cell) => cell === null)).toBe(true);
  });

  it("完成ラインを表示してから消去と得点計算を反映する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    const bottomRow = game.getSnapshot().board[BOARD_HEIGHT - 1] as Cell[] | undefined;
    if (bottomRow === undefined) {
      throw new Error("テスト盤面を取得できませんでした。");
    }

    bottomRow.fill("J");
    for (let x = 3; x <= 6; x += 1) {
      bottomRow[x] = null;
    }

    game.hardDrop();
    const clearingSnapshot = game.getSnapshot();

    expect(clearingSnapshot.clearingRows).toEqual([BOARD_HEIGHT - 1]);
    expect(clearingSnapshot.lineClearProgress).toBe(0);
    expect(clearingSnapshot.clearedLines).toBe(0);
    expect(clearingSnapshot.score).toBe(0);
    expect(
      clearingSnapshot.board[BOARD_HEIGHT - 1]?.every((cell) => cell !== null),
    ).toBe(true);

    const activeX = clearingSnapshot.activePiece.position.x;
    game.moveLeft();
    game.hardDrop();
    expect(game.getSnapshot().activePiece.position.x).toBe(activeX);
    expect(game.getSnapshot().fixedPieces).toBe(1);

    game.update(LINE_CLEAR_ANIMATION_MS - 1);
    expect(game.getSnapshot().clearedLines).toBe(0);

    game.update(1);
    const snapshot = game.getSnapshot();

    expect(snapshot.clearingRows).toEqual([]);
    expect(snapshot.clearedLines).toBe(1);
    expect(snapshot.score).toBe(100);
    expect(snapshot.board[BOARD_HEIGHT - 1]?.every((cell) => cell === null)).toBe(true);
  });

  it("消去ライン数とレベルに応じて得点を計算する", () => {
    expect(calculateLineClearScore(0, 1)).toBe(0);
    expect(calculateLineClearScore(1, 1)).toBe(100);
    expect(calculateLineClearScore(2, 2)).toBe(600);
    expect(calculateLineClearScore(3, 3)).toBe(1_500);
    expect(calculateLineClearScore(4, 4)).toBe(3_200);
  });

  it("レベルに応じて落下間隔を短縮し下限を維持する", () => {
    expect(calculateFallInterval(1)).toBe(FALL_INTERVAL_MS);
    expect(calculateFallInterval(2)).toBe(FALL_INTERVAL_MS - 50);
    expect(calculateFallInterval(12)).toBe(MIN_FALL_INTERVAL_MS);
    expect(calculateFallInterval(99)).toBe(MIN_FALL_INTERVAL_MS);
  });

  it("積み上がりが出現位置へ達するとゲームオーバーになる", () => {
    const game = new FallingBlockGame(deterministicRandom);

    for (let count = 0; count < 100 && !game.getSnapshot().isGameOver; count += 1) {
      game.hardDrop();
      if (game.getSnapshot().clearingRows.length > 0) {
        game.update(LINE_CLEAR_ANIMATION_MS);
      }
    }

    expect(game.getSnapshot().isGameOver).toBe(true);
  });

  it("再開すると盤面と進行状況を初期化する", () => {
    const game = new FallingBlockGame(deterministicRandom);
    game.hardDrop();
    game.update(FALL_INTERVAL_MS);

    game.restart();
    const snapshot = game.getSnapshot();

    expect(snapshot.fixedPieces).toBe(0);
    expect(snapshot.score).toBe(0);
    expect(snapshot.clearedLines).toBe(0);
    expect(snapshot.level).toBe(1);
    expect(snapshot.fallIntervalMs).toBe(FALL_INTERVAL_MS);
    expect(snapshot.clearingRows).toEqual([]);
    expect(snapshot.lineClearProgress).toBe(0);
    expect(snapshot.lockDelayProgress).toBe(0);
    expect(snapshot.heldKind).toBeNull();
    expect(snapshot.canHold).toBe(true);
    expect(snapshot.elapsedSeconds).toBe(0);
    expect(snapshot.isGameOver).toBe(false);
    expect(snapshot.board.flat().every((cell) => cell === null)).toBe(true);
  });
});
