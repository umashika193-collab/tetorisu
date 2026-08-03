export interface GameControls {
  moveLeft: () => void;
  moveRight: () => void;
  softDrop: () => void;
  rotateClockwise: () => void;
  rotateCounterClockwise: () => void;
  hardDrop: () => void;
  hold: () => void;
  restart: () => void;
  togglePause: () => void;
  toggleSound: () => void;
}

type RepeatTimer = {
  delay: ReturnType<typeof window.setTimeout>;
  interval: ReturnType<typeof window.setInterval> | null;
};

const REPEATABLE_ACTIONS = new Set(["left", "right", "soft-drop"]);
const TOUCH_ACTIONS = [
  "left",
  "right",
  "soft-drop",
  "hard-drop",
  "rotate-clockwise",
  "rotate-counterclockwise",
  "hold",
  "pause",
] as const;

type TouchAction = (typeof TOUCH_ACTIONS)[number];

export class KeyboardInput {
  public constructor(private readonly controls: GameControls) {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  public destroy(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, select, summary") !== null &&
      event.code !== "KeyM" &&
      event.code !== "KeyR" &&
      event.code !== "KeyP" &&
      event.code !== "Escape"
    ) {
      return;
    }

    if (event.repeat && event.code === "KeyM") {
      return;
    }

    if (event.repeat && (event.code === "KeyP" || event.code === "Escape")) {
      return;
    }

    const action = this.getAction(event.code);

    if (action !== null) {
      event.preventDefault();
      action();
    }
  };

  private getAction(code: string): (() => void) | null {
    switch (code) {
      case "ArrowLeft":
        return this.controls.moveLeft;
      case "ArrowRight":
        return this.controls.moveRight;
      case "ArrowDown":
        return this.controls.softDrop;
      case "ArrowUp":
      case "KeyX":
        return this.controls.rotateClockwise;
      case "KeyZ":
        return this.controls.rotateCounterClockwise;
      case "Space":
        return this.controls.hardDrop;
      case "KeyC":
      case "ShiftLeft":
      case "ShiftRight":
        return this.controls.hold;
      case "KeyR":
        return this.controls.restart;
      case "KeyP":
      case "Escape":
        return this.controls.togglePause;
      case "KeyM":
        return this.controls.toggleSound;
      default:
        return null;
    }
  }
}

/** 画面上の操作盤を、タップと長押しのゲーム入力へ変換する。 */
export class TouchInput {
  private readonly buttons: HTMLButtonElement[];
  private readonly repeatTimers = new Map<number, RepeatTimer>();

  public constructor(
    root: HTMLElement,
    private readonly controls: GameControls,
  ) {
    this.buttons = Array.from(
      root.querySelectorAll<HTMLButtonElement>("[data-touch-action]"),
    );
    this.buttons.forEach((button) => {
      button.addEventListener("pointerdown", this.handlePointerDown);
      button.addEventListener("pointerup", this.handlePointerEnd);
      button.addEventListener("pointercancel", this.handlePointerEnd);
      button.addEventListener("lostpointercapture", this.handlePointerEnd);
      button.addEventListener("click", this.handleKeyboardClick);
      button.addEventListener("contextmenu", this.preventContextMenu);
    });
  }

  public cancelActive(): void {
    this.repeatTimers.forEach((timer) => {
      window.clearTimeout(timer.delay);
      if (timer.interval !== null) {
        window.clearInterval(timer.interval);
      }
    });
    this.repeatTimers.clear();
    this.buttons.forEach((button) => button.classList.remove("is-pressed"));
  }

  public destroy(): void {
    this.cancelActive();
    this.buttons.forEach((button) => {
      button.removeEventListener("pointerdown", this.handlePointerDown);
      button.removeEventListener("pointerup", this.handlePointerEnd);
      button.removeEventListener("pointercancel", this.handlePointerEnd);
      button.removeEventListener("lostpointercapture", this.handlePointerEnd);
      button.removeEventListener("click", this.handleKeyboardClick);
      button.removeEventListener("contextmenu", this.preventContextMenu);
    });
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLButtonElement)) {
      return;
    }

    const action = getTouchAction(event.currentTarget);
    if (action === null || event.currentTarget.disabled) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-pressed");
    this.runAction(action);

    if (!REPEATABLE_ACTIONS.has(action)) {
      return;
    }

    const initialDelay = action === "soft-drop" ? 90 : 155;
    const repeatInterval = action === "soft-drop" ? 52 : 42;
    const timer: RepeatTimer = {
      delay: window.setTimeout(() => {
        timer.interval = window.setInterval(() => {
          this.runAction(action);
        }, repeatInterval);
      }, initialDelay),
      interval: null,
    };
    this.repeatTimers.set(event.pointerId, timer);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    const timer = this.repeatTimers.get(event.pointerId);
    if (timer !== undefined) {
      window.clearTimeout(timer.delay);
      if (timer.interval !== null) {
        window.clearInterval(timer.interval);
      }
      this.repeatTimers.delete(event.pointerId);
    }

    if (event.currentTarget instanceof HTMLButtonElement) {
      event.currentTarget.classList.remove("is-pressed");
    }
  };

  private readonly handleKeyboardClick = (event: MouseEvent): void => {
    if (event.detail !== 0 || !(event.currentTarget instanceof HTMLButtonElement)) {
      return;
    }

    const action = getTouchAction(event.currentTarget);
    if (action !== null) {
      this.runAction(action);
    }
  };

  private readonly preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private runAction(action: TouchAction): void {
    const actions: Record<TouchAction, () => void> = {
      left: this.controls.moveLeft,
      right: this.controls.moveRight,
      "soft-drop": this.controls.softDrop,
      "hard-drop": this.controls.hardDrop,
      "rotate-clockwise": this.controls.rotateClockwise,
      "rotate-counterclockwise": this.controls.rotateCounterClockwise,
      hold: this.controls.hold,
      pause: this.controls.togglePause,
    };
    actions[action]();
  }
}

function getTouchAction(button: HTMLButtonElement): TouchAction | null {
  const action = button.dataset.touchAction;
  return TOUCH_ACTIONS.find((candidate) => candidate === action) ?? null;
}
