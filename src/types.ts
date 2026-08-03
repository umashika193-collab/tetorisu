export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const FALL_INTERVAL_MS = 650;
export const MIN_FALL_INTERVAL_MS = 100;
export const FALL_INTERVAL_STEP_MS = 50;
export const LINES_PER_LEVEL = 10;
export const LINE_CLEAR_ANIMATION_MS = 400;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;

export type TetrominoKind = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export type RotationState = 0 | 1 | 2 | 3;
export type RotationDirection = "clockwise" | "counterclockwise";
export type Cell = TetrominoKind | null;
export type Matrix = readonly (readonly number[])[];

export interface Position {
  x: number;
  y: number;
}

export interface ActivePiece {
  kind: TetrominoKind;
  matrix: Matrix;
  position: Position;
  rotation: RotationState;
}

export interface GameSnapshot {
  board: readonly (readonly Cell[])[];
  activePiece: ActivePiece;
  ghostPosition: Position;
  nextKind: TetrominoKind;
  heldKind: TetrominoKind | null;
  canHold: boolean;
  isGameOver: boolean;
  fixedPieces: number;
  score: number;
  clearedLines: number;
  level: number;
  fallIntervalMs: number;
  clearingRows: readonly number[];
  lineClearProgress: number;
  lockDelayProgress: number;
  elapsedSeconds: number;
}
