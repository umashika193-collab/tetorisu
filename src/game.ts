import { SevenBag } from "./bag";
import {
  createShape,
  getSrsKickOffsets,
  rotateClockwise as rotateMatrixClockwise,
  rotateCounterClockwise as rotateMatrixCounterClockwise,
} from "./tetrominoes";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  FALL_INTERVAL_STEP_MS,
  FALL_INTERVAL_MS,
  LINE_CLEAR_ANIMATION_MS,
  LINES_PER_LEVEL,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  MIN_FALL_INTERVAL_MS,
  type ActivePiece,
  type Cell,
  type GameSnapshot,
  type Matrix,
  type Position,
  type RotationDirection,
  type RotationState,
  type TetrominoKind,
} from "./types";

const LINE_CLEAR_BASE_SCORES = [0, 100, 300, 500, 800] as const;

export function findCompletedRows(board: readonly (readonly Cell[])[]): number[] {
  const completedRows: number[] = [];
  board.forEach((row, index) => {
    if (row.every((cell) => cell !== null)) {
      completedRows.push(index);
    }
  });
  return completedRows;
}

export function clearCompletedLines(board: Cell[][]): number {
  const completedRows = findCompletedRows(board);
  const completedRowSet = new Set(completedRows);
  const remainingRows = board.filter((_, index) => !completedRowSet.has(index));
  const clearedLines = completedRows.length;

  if (clearedLines === 0) {
    return 0;
  }

  const emptyRows = Array.from({ length: clearedLines }, () =>
    Array<Cell>(BOARD_WIDTH).fill(null),
  );
  board.splice(0, board.length, ...emptyRows, ...remainingRows);
  return clearedLines;
}

export function calculateLineClearScore(clearedLines: number, level: number): number {
  return (LINE_CLEAR_BASE_SCORES[clearedLines] ?? 0) * level;
}

export function calculateFallInterval(level: number): number {
  return Math.max(
    MIN_FALL_INTERVAL_MS,
    FALL_INTERVAL_MS - (level - 1) * FALL_INTERVAL_STEP_MS,
  );
}

export class FallingBlockGame {
  private board: Cell[][] = this.createEmptyBoard();
  private readonly bag: SevenBag;
  private activePiece: ActivePiece = this.createPiece("T");
  private nextKind: TetrominoKind = "I";
  private heldKind: TetrominoKind | null = null;
  private canHold = true;
  private isGameOver = false;
  private fixedPieces = 0;
  private score = 0;
  private clearedLines = 0;
  private level = 1;
  private clearingRows: number[] = [];
  private lineClearElapsedMs = 0;
  private fallAccumulator = 0;
  private lockElapsedMs = 0;
  private lockResetCount = 0;
  private elapsedMs = 0;

  public constructor(random: () => number = Math.random) {
    this.bag = new SevenBag(random);
    this.restart();
  }

  public restart(): void {
    this.board = this.createEmptyBoard();
    this.bag.reset();
    this.isGameOver = false;
    this.fixedPieces = 0;
    this.score = 0;
    this.clearedLines = 0;
    this.level = 1;
    this.heldKind = null;
    this.canHold = true;
    this.clearingRows = [];
    this.lineClearElapsedMs = 0;
    this.fallAccumulator = 0;
    this.lockElapsedMs = 0;
    this.lockResetCount = 0;
    this.elapsedMs = 0;
    this.activePiece = this.createPiece(this.bag.take());
    this.nextKind = this.bag.take();
  }

  public update(deltaMs: number): void {
    if (this.isGameOver) {
      return;
    }

    this.elapsedMs += deltaMs;

    if (this.clearingRows.length > 0) {
      this.lineClearElapsedMs += deltaMs;
      if (this.lineClearElapsedMs >= LINE_CLEAR_ANIMATION_MS) {
        this.finishLineClear();
      }
      return;
    }

    const wasGrounded = this.isGrounded();
    this.fallAccumulator += deltaMs;

    while (
      this.fallAccumulator >= calculateFallInterval(this.level) &&
      !this.isGameOver &&
      this.clearingRows.length === 0
    ) {
      this.fallAccumulator -= calculateFallInterval(this.level);
      if (!this.tryMove(0, 1)) {
        this.fallAccumulator = 0;
        break;
      }
    }

    if (!this.isGrounded()) {
      this.lockElapsedMs = 0;
      return;
    }

    if (wasGrounded) {
      this.lockElapsedMs += deltaMs;
    } else {
      this.lockElapsedMs = 0;
    }

    if (this.lockElapsedMs >= LOCK_DELAY_MS) {
      this.lockPiece();
    }
  }

  public moveLeft(): void {
    this.moveHorizontally(-1);
  }

  public moveRight(): void {
    this.moveHorizontally(1);
  }

  public softDrop(): void {
    if (this.isGameOver || this.clearingRows.length > 0) {
      return;
    }

    this.tryMove(0, 1);
    this.fallAccumulator = 0;
  }

  public hardDrop(): void {
    if (this.isGameOver || this.clearingRows.length > 0) {
      return;
    }

    while (this.tryMove(0, 1)) {
      // 着地するまで移動する。
    }
    this.lockPiece();
    this.fallAccumulator = 0;
  }

  public rotate(): void {
    this.rotateClockwise();
  }

  public rotateClockwise(): void {
    this.rotatePiece("clockwise");
  }

  public rotateCounterClockwise(): void {
    this.rotatePiece("counterclockwise");
  }

  public hold(): void {
    if (this.isGameOver || this.clearingRows.length > 0) {
      return;
    }

    if (!this.canHold) {
      return;
    }

    const outgoingKind = this.activePiece.kind;
    if (this.heldKind === null) {
      this.heldKind = outgoingKind;
      this.activePiece = this.createPiece(this.nextKind);
      this.nextKind = this.bag.take();
    } else {
      const incomingKind = this.heldKind;
      this.heldKind = outgoingKind;
      this.activePiece = this.createPiece(incomingKind);
    }

    this.canHold = false;
    this.resetPieceTimers();

    if (
      this.collides(
        this.activePiece.matrix,
        this.activePiece.position.x,
        this.activePiece.position.y,
      )
    ) {
      this.isGameOver = true;
    }
  }

  public getSnapshot(): GameSnapshot {
    return {
      board: this.board,
      activePiece: this.activePiece,
      ghostPosition: this.getGhostPosition(),
      nextKind: this.nextKind,
      heldKind: this.heldKind,
      canHold: this.canHold,
      isGameOver: this.isGameOver,
      fixedPieces: this.fixedPieces,
      score: this.score,
      clearedLines: this.clearedLines,
      level: this.level,
      fallIntervalMs: calculateFallInterval(this.level),
      clearingRows: this.clearingRows,
      lineClearProgress:
        this.clearingRows.length === 0
          ? 0
          : Math.min(this.lineClearElapsedMs / LINE_CLEAR_ANIMATION_MS, 1),
      lockDelayProgress: Math.min(this.lockElapsedMs / LOCK_DELAY_MS, 1),
      elapsedSeconds: Math.floor(this.elapsedMs / 1000),
    };
  }

  private moveHorizontally(offsetX: number): void {
    if (this.isGameOver || this.clearingRows.length > 0) {
      return;
    }

    const wasGrounded = this.isGrounded();
    if (this.tryMove(offsetX, 0)) {
      this.resetLockDelayAfterAdjustment(wasGrounded);
    }
  }

  private rotatePiece(direction: RotationDirection): void {
    if (this.isGameOver || this.clearingRows.length > 0) {
      return;
    }

    const from = this.activePiece.rotation;
    const to = ((from + (direction === "clockwise" ? 1 : 3)) % 4) as RotationState;
    const rotated =
      direction === "clockwise"
        ? rotateMatrixClockwise(this.activePiece.matrix)
        : rotateMatrixCounterClockwise(this.activePiece.matrix);
    const wasGrounded = this.isGrounded();

    for (const offset of getSrsKickOffsets(this.activePiece.kind, from, to)) {
      const position = {
        x: this.activePiece.position.x + offset.x,
        y: this.activePiece.position.y + offset.y,
      };

      if (!this.collides(rotated, position.x, position.y)) {
        this.activePiece = {
          ...this.activePiece,
          matrix: rotated,
          position,
          rotation: to,
        };
        this.resetLockDelayAfterAdjustment(wasGrounded);
        return;
      }
    }
  }

  private resetLockDelayAfterAdjustment(wasGrounded: boolean): void {
    if (wasGrounded && this.lockResetCount < MAX_LOCK_RESETS) {
      this.lockElapsedMs = 0;
      this.lockResetCount += 1;
    }
  }

  private tryMove(offsetX: number, offsetY: number): boolean {
    if (this.isGameOver || this.clearingRows.length > 0) {
      return false;
    }

    const nextX = this.activePiece.position.x + offsetX;
    const nextY = this.activePiece.position.y + offsetY;

    if (this.collides(this.activePiece.matrix, nextX, nextY)) {
      return false;
    }

    this.activePiece = {
      ...this.activePiece,
      position: { x: nextX, y: nextY },
    };
    return true;
  }

  private collides(matrix: Matrix, positionX: number, positionY: number): boolean {
    for (let y = 0; y < matrix.length; y += 1) {
      const row = matrix[y];
      if (row === undefined) {
        continue;
      }

      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== 1) {
          continue;
        }

        const boardX = positionX + x;
        const boardY = positionY + y;

        if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
          return true;
        }

        if (boardY >= 0 && this.board[boardY]?.[boardX] !== null) {
          return true;
        }
      }
    }

    return false;
  }

  private isGrounded(): boolean {
    return this.collides(
      this.activePiece.matrix,
      this.activePiece.position.x,
      this.activePiece.position.y + 1,
    );
  }

  private getGhostPosition(): Position {
    let ghostY = this.activePiece.position.y;
    while (
      !this.collides(this.activePiece.matrix, this.activePiece.position.x, ghostY + 1)
    ) {
      ghostY += 1;
    }

    return { x: this.activePiece.position.x, y: ghostY };
  }

  private lockPiece(): void {
    let overflowed = false;

    for (let y = 0; y < this.activePiece.matrix.length; y += 1) {
      const row = this.activePiece.matrix[y];
      if (row === undefined) {
        continue;
      }

      for (let x = 0; x < row.length; x += 1) {
        if (row[x] !== 1) {
          continue;
        }

        const boardX = this.activePiece.position.x + x;
        const boardY = this.activePiece.position.y + y;

        if (boardY < 0) {
          overflowed = true;
        } else {
          const boardRow = this.board[boardY];
          if (boardRow !== undefined) {
            boardRow[boardX] = this.activePiece.kind;
          }
        }
      }
    }

    this.fixedPieces += 1;
    this.lockElapsedMs = 0;
    this.lockResetCount = 0;

    if (overflowed) {
      this.isGameOver = true;
      return;
    }

    this.clearingRows = findCompletedRows(this.board);
    if (this.clearingRows.length > 0) {
      this.lineClearElapsedMs = 0;
      this.fallAccumulator = 0;
      return;
    }

    this.spawnNextPiece();
  }

  private finishLineClear(): void {
    const completedLines = clearCompletedLines(this.board);
    this.score += calculateLineClearScore(completedLines, this.level);
    this.clearedLines += completedLines;
    this.level = Math.floor(this.clearedLines / LINES_PER_LEVEL) + 1;
    this.clearingRows = [];
    this.lineClearElapsedMs = 0;

    this.spawnNextPiece();
  }

  private spawnNextPiece(): void {
    this.activePiece = this.createPiece(this.nextKind);
    this.nextKind = this.bag.take();
    this.canHold = true;
    this.resetPieceTimers();

    if (
      this.collides(
        this.activePiece.matrix,
        this.activePiece.position.x,
        this.activePiece.position.y,
      )
    ) {
      this.isGameOver = true;
    }
  }

  private createPiece(kind: TetrominoKind): ActivePiece {
    const matrix = createShape(kind);
    return {
      kind,
      matrix,
      position: {
        x: Math.floor((BOARD_WIDTH - matrix.length) / 2),
        y: -1,
      },
      rotation: 0,
    };
  }

  private resetPieceTimers(): void {
    this.fallAccumulator = 0;
    this.lockElapsedMs = 0;
    this.lockResetCount = 0;
  }

  private createEmptyBoard(): Cell[][] {
    return Array.from({ length: BOARD_HEIGHT }, () =>
      Array<Cell>(BOARD_WIDTH).fill(null),
    );
  }
}
