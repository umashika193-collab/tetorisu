import { createShape } from "./tetrominoes";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type ActivePiece,
  type GameSnapshot,
  type Matrix,
  type Position,
  type TetrominoKind,
} from "./types";

const COLORS: Readonly<Record<TetrominoKind, string>> = {
  I: "#87c4c5",
  J: "#647da3",
  L: "#d98842",
  O: "#d9b84b",
  S: "#7f9d59",
  T: "#9d6f99",
  Z: "#bd5148",
};

const BOARD_BACKGROUND = "#1b1713";
const GRID_COLOR = "rgba(244, 226, 188, 0.1)";

export class GameRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly nextContext: CanvasRenderingContext2D;
  private readonly holdContext: CanvasRenderingContext2D;
  private readonly devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly nextCanvas: HTMLCanvasElement,
    private readonly holdCanvas: HTMLCanvasElement,
  ) {
    const context = canvas.getContext("2d");
    const nextContext = nextCanvas.getContext("2d");
    const holdContext = holdCanvas.getContext("2d");

    if (context === null || nextContext === null || holdContext === null) {
      throw new Error("Canvas 2Dコンテキストを初期化できませんでした。");
    }

    this.context = context;
    this.nextContext = nextContext;
    this.holdContext = holdContext;
    this.prepareCanvas(canvas, 360, 720);
    this.prepareCanvas(nextCanvas, 152, 112);
    this.prepareCanvas(holdCanvas, 152, 112);
  }

  public draw(snapshot: GameSnapshot): void {
    const cellSize = this.canvas.width / this.devicePixelRatio / BOARD_WIDTH;
    const width = cellSize * BOARD_WIDTH;
    const height = cellSize * BOARD_HEIGHT;

    this.context.clearRect(0, 0, width, height);
    this.context.fillStyle = BOARD_BACKGROUND;
    this.context.fillRect(0, 0, width, height);
    this.drawGrid(cellSize);

    snapshot.board.forEach((row, y) => {
      row.forEach((kind, x) => {
        if (kind !== null) {
          this.drawCell(this.context, x * cellSize, y * cellSize, cellSize, kind);
        }
      });
    });

    if (snapshot.clearingRows.length === 0) {
      this.drawGhost(snapshot.activePiece, snapshot.ghostPosition, cellSize);
      this.drawPiece(snapshot.activePiece, cellSize);
    } else {
      this.drawLineClearEffect(
        snapshot.clearingRows,
        snapshot.lineClearProgress,
        cellSize,
      );
    }
    this.drawPreview(this.nextContext, this.nextCanvas, snapshot.nextKind);
    this.drawPreview(
      this.holdContext,
      this.holdCanvas,
      snapshot.heldKind,
      snapshot.canHold ? 1 : 0.38,
    );
  }

  private drawLineClearEffect(
    rows: readonly number[],
    progress: number,
    cellSize: number,
  ): void {
    const width = BOARD_WIDTH * cellSize;
    const flashEnd = 0.45;

    rows.forEach((row) => {
      const y = row * cellSize;

      if (progress < flashEnd) {
        const intensity = 0.18 + (progress / flashEnd) * 0.68;
        this.context.fillStyle = `rgba(248, 237, 207, ${intensity})`;
        this.context.fillRect(0, y, width, cellSize);
        return;
      }

      const wipeProgress = (progress - flashEnd) / (1 - flashEnd);
      const wipeWidth = width * wipeProgress;
      const wipeX = (width - wipeWidth) / 2;
      this.context.fillStyle = BOARD_BACKGROUND;
      this.context.fillRect(wipeX, y, wipeWidth, cellSize);

      const edgeWidth = Math.min(6, (width - wipeWidth) / 2);
      if (edgeWidth > 0) {
        this.context.fillStyle = `rgba(164, 58, 45, ${1 - wipeProgress})`;
        this.context.fillRect(wipeX - edgeWidth, y, edgeWidth, cellSize);
        this.context.fillRect(wipeX + wipeWidth, y, edgeWidth, cellSize);
      }
    });
  }

  private prepareCanvas(
    canvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
  ): void {
    canvas.width = cssWidth * this.devicePixelRatio;
    canvas.height = cssHeight * this.devicePixelRatio;
    canvas.style.aspectRatio = `${cssWidth} / ${cssHeight}`;
    const context = canvas.getContext("2d");
    context?.scale(this.devicePixelRatio, this.devicePixelRatio);
  }

  private drawGrid(cellSize: number): void {
    this.context.strokeStyle = GRID_COLOR;
    this.context.lineWidth = 1;

    for (let x = 1; x < BOARD_WIDTH; x += 1) {
      this.context.beginPath();
      this.context.moveTo(x * cellSize + 0.5, 0);
      this.context.lineTo(x * cellSize + 0.5, BOARD_HEIGHT * cellSize);
      this.context.stroke();
    }

    for (let y = 1; y < BOARD_HEIGHT; y += 1) {
      this.context.beginPath();
      this.context.moveTo(0, y * cellSize + 0.5);
      this.context.lineTo(BOARD_WIDTH * cellSize, y * cellSize + 0.5);
      this.context.stroke();
    }
  }

  private drawPiece(piece: ActivePiece, cellSize: number): void {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        const boardY = piece.position.y + y;
        if (value === 1 && boardY >= 0) {
          this.drawCell(
            this.context,
            (piece.position.x + x) * cellSize,
            boardY * cellSize,
            cellSize,
            piece.kind,
          );
        }
      });
    });
  }

  private drawGhost(
    piece: ActivePiece,
    ghostPosition: Position,
    cellSize: number,
  ): void {
    piece.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        const boardY = ghostPosition.y + y;
        if (value === 1 && boardY >= 0) {
          this.drawGhostCell(
            (ghostPosition.x + x) * cellSize,
            boardY * cellSize,
            cellSize,
            piece.kind,
          );
        }
      });
    });
  }

  private drawPreview(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    kind: TetrominoKind | null,
    opacity = 1,
  ): void {
    const width = canvas.width / this.devicePixelRatio;
    const height = canvas.height / this.devicePixelRatio;

    context.clearRect(0, 0, width, height);
    if (kind === null) {
      return;
    }

    const matrix = createShape(kind);
    const occupied = this.getOccupiedBounds(matrix);
    const cellSize = 24;
    const shapeWidth = occupied.width * cellSize;
    const shapeHeight = occupied.height * cellSize;
    const offsetX = (width - shapeWidth) / 2 - occupied.minX * cellSize;
    const offsetY = (height - shapeHeight) / 2 - occupied.minY * cellSize;

    context.save();
    context.globalAlpha = opacity;

    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value === 1) {
          this.drawCell(
            context,
            offsetX + x * cellSize,
            offsetY + y * cellSize,
            cellSize,
            kind,
          );
        }
      });
    });
    context.restore();
  }

  private getOccupiedBounds(matrix: Matrix): {
    minX: number;
    minY: number;
    width: number;
    height: number;
  } {
    const cells: { x: number; y: number }[] = [];
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value === 1) {
          cells.push({ x, y });
        }
      });
    });

    const xs = cells.map((cell) => cell.x);
    const ys = cells.map((cell) => cell.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX,
      minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  private drawCell(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    kind: TetrominoKind,
  ): void {
    const gap = Math.max(2, size * 0.08);
    const innerX = x + gap;
    const innerY = y + gap;
    const innerSize = size - gap * 2;
    const color = COLORS[kind];

    context.fillStyle = "#0f0c0a";
    context.fillRect(innerX - 1, innerY - 1, innerSize + 2, innerSize + 2);

    context.fillStyle = color;
    context.fillRect(innerX, innerY, innerSize, innerSize);

    context.fillStyle = "rgba(255, 244, 211, 0.34)";
    context.fillRect(
      innerX + 1,
      innerY + 1,
      innerSize - 2,
      Math.max(2, innerSize * 0.09),
    );
    context.fillRect(
      innerX + 1,
      innerY + 1,
      Math.max(2, innerSize * 0.09),
      innerSize - 2,
    );

    context.fillStyle = "rgba(28, 23, 18, 0.33)";
    context.fillRect(
      innerX,
      innerY + innerSize - Math.max(2, innerSize * 0.1),
      innerSize,
      Math.max(2, innerSize * 0.1),
    );

    context.fillStyle = "rgba(28, 23, 18, 0.18)";
    context.fillRect(
      innerX + innerSize * 0.62,
      innerY + innerSize * 0.28,
      Math.max(1, innerSize * 0.08),
      Math.max(1, innerSize * 0.08),
    );
  }

  private drawGhostCell(x: number, y: number, size: number, kind: TetrominoKind): void {
    const gap = Math.max(3, size * 0.12);
    const innerSize = size - gap * 2;

    this.context.save();
    this.context.globalAlpha = 0.58;
    this.context.strokeStyle = COLORS[kind];
    this.context.lineWidth = Math.max(2, size * 0.065);
    this.context.strokeRect(x + gap, y + gap, innerSize, innerSize);
    this.context.restore();
  }
}
