import { VintageAudio } from "./audio";
import { BgmPlayer, BUILT_IN_BGM, type BgmSnapshot } from "./bgm";
import { FallingBlockGame } from "./game";
import { KeyboardInput, TouchInput } from "./input";
import { setupPwaInstall } from "./pwa";
import { PersonalBestStore, type GameRecord } from "./records";
import { GameRenderer } from "./renderer";
import type { GameSnapshot } from "./types";
import "./style.css";

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`必要な要素が見つかりません: ${selector}`);
  }
  return element;
}

const gameCanvas = requireElement<HTMLCanvasElement>("#gameCanvas");
const nextCanvas = requireElement<HTMLCanvasElement>("#nextCanvas");
const holdCanvas = requireElement<HTMLCanvasElement>("#holdCanvas");
const titleScreen = requireElement<HTMLElement>("#titleScreen");
const startButton = requireElement<HTMLButtonElement>("#startButton");
const statusPill = requireElement<HTMLDivElement>("#statusPill");
const statusText = requireElement<HTMLSpanElement>("#statusText");
const pieceLabel = requireElement<HTMLSpanElement>("#pieceLabel");
const scoreValue = requireElement<HTMLParagraphElement>("#scoreValue");
const linesValue = requireElement<HTMLParagraphElement>("#linesValue");
const levelValue = requireElement<HTMLParagraphElement>("#levelValue");
const timeValue = requireElement<HTMLParagraphElement>("#timeValue");
const gameOverPanel = requireElement<HTMLDivElement>("#gameOverPanel");
const restartButton = requireElement<HTMLButtonElement>("#restartButton");
const overlayRestartButton = requireElement<HTMLButtonElement>("#overlayRestartButton");
const pauseButton = requireElement<HTMLButtonElement>("#pauseButton");
const pauseButtonLabel = requireElement<HTMLSpanElement>("#pauseButtonLabel");
const pausePanel = requireElement<HTMLDivElement>("#pausePanel");
const pauseReason = requireElement<HTMLParagraphElement>("#pauseReason");
const resumeButton = requireElement<HTMLButtonElement>("#resumeButton");
const pauseRestartButton = requireElement<HTMLButtonElement>("#pauseRestartButton");
const touchControls = requireElement<HTMLElement>("#touchControls");
const touchActionButtons = Array.from(
  touchControls.querySelectorAll<HTMLButtonElement>("[data-touch-action]"),
);
const touchPauseSymbol = requireElement<HTMLSpanElement>(
  '[data-touch-action="pause"] .touch-symbol',
);
const touchPauseLabel = requireElement<HTMLSpanElement>(
  '[data-touch-action="pause"] .touch-label',
);
const titleBestScore = requireElement<HTMLElement>("#titleBestScore");
const resultScore = requireElement<HTMLElement>("#resultScore");
const resultLines = requireElement<HTMLElement>("#resultLines");
const resultLevel = requireElement<HTMLElement>("#resultLevel");
const resultTime = requireElement<HTMLElement>("#resultTime");
const resultBestScore = requireElement<HTMLElement>("#resultBestScore");
const newBestBanner = requireElement<HTMLElement>("#newBestBanner");
const soundButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-sound-toggle]"),
);
const soundStateLabels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-sound-state]"),
);
const bgmFileInput = requireElement<HTMLInputElement>("#bgmFileInput");
const bgmSelects = Array.from(
  document.querySelectorAll<HTMLSelectElement>("[data-bgm-select]"),
);
const bgmVolumeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>("[data-bgm-volume]"),
);
const bgmVolumeValues = Array.from(
  document.querySelectorAll<HTMLOutputElement>("[data-bgm-volume-value]"),
);
const bgmToggleButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-bgm-toggle]"),
);
const bgmToggleLabels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-bgm-toggle-label]"),
);
const bgmFileButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-bgm-file]"),
);
const bgmNowLabels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-bgm-now]"),
);
const musicMenus = Array.from(
  document.querySelectorAll<HTMLDetailsElement>("[data-music-menu]"),
);
const pwaInstallButton = requireElement<HTMLButtonElement>("#pwaInstallButton");
const pwaInstallDialog = requireElement<HTMLDialogElement>("#pwaInstallDialog");
const pwaInstallHelp = requireElement<HTMLElement>("#pwaInstallHelp");
const pwaInstallClose = requireElement<HTMLButtonElement>("#pwaInstallClose");

const game = new FallingBlockGame();
const renderer = new GameRenderer(gameCanvas, nextCanvas, holdCanvas);
const audio = new VintageAudio();
const bgm = new BgmPlayer();
const records = new PersonalBestStore();
let hasStarted = false;
let isPaused = false;
let personalBest = records.load();
let hasHandledGameOver = false;
let touchInput: TouchInput | null = null;
let previousTime = performance.now();
let previousAudioSnapshot = game.getSnapshot();

populateBgmSelects();
bgm.setMasterMuted(audio.isMuted());
const unsubscribeFromBgm = bgm.subscribe(updateBgmControls);
const destroyPwaInstall = setupPwaInstall({
  button: pwaInstallButton,
  dialog: pwaInstallDialog,
  help: pwaInstallHelp,
  closeButton: pwaInstallClose,
});

function updateSoundControls(): void {
  const supported = audio.isSupported();
  const muted = audio.isMuted();

  soundButtons.forEach((button) => {
    button.disabled = !supported;
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute(
      "aria-label",
      !supported
        ? "このブラウザーでは音を再生できません"
        : muted
          ? "音を出す"
          : "音を消す",
    );
  });
  soundStateLabels.forEach((label) => {
    label.textContent = !supported ? "不可" : muted ? "なし" : "あり";
  });
}

function toggleSound(): void {
  const muted = audio.toggleMuted();
  bgm.setMasterMuted(muted);
  updateSoundControls();
}

function handleSoundButtonClick(): void {
  toggleSound();
}

function populateBgmSelects(): void {
  bgmSelects.forEach((select) => {
    const options = BUILT_IN_BGM.map((track) => new Option(track.title, track.id));
    select.replaceChildren(...options);
  });
}

function updateBgmControls(snapshot: BgmSnapshot): void {
  bgmSelects.forEach((select) => {
    const customOption = select.querySelector<HTMLOptionElement>(
      'option[value="custom"]',
    );
    if (snapshot.isCustomTrack) {
      if (customOption === null) {
        select.add(new Option(`手持ち · ${snapshot.trackTitle}`, "custom"), 0);
      } else {
        customOption.textContent = `手持ち · ${snapshot.trackTitle}`;
      }
    } else {
      customOption?.remove();
    }
    select.value = snapshot.trackId;
  });

  const volumePercent = Math.round(snapshot.volume * 100);
  bgmVolumeInputs.forEach((input) => {
    input.value = String(volumePercent);
  });
  bgmVolumeValues.forEach((output) => {
    output.value = String(volumePercent);
    output.textContent = String(volumePercent);
  });
  bgmToggleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(!snapshot.enabled));
  });
  bgmToggleLabels.forEach((label) => {
    label.textContent = snapshot.enabled ? "伴奏を休む" : "伴奏を再開";
  });

  const statusText = getBgmStatusText(snapshot);
  bgmNowLabels.forEach((label) => {
    label.textContent = statusText;
    label.classList.toggle("music-now--error", snapshot.status === "error");
  });
}

function getBgmStatusText(snapshot: BgmSnapshot): string {
  if (snapshot.status === "error") {
    return snapshot.errorMessage ?? "この音源は再生できませんでした";
  }
  if (!snapshot.enabled || snapshot.status === "paused") {
    return `${snapshot.trackTitle} · ${snapshot.suspended ? "上映休止中" : "休憩中"}`;
  }
  if (snapshot.status === "loading") {
    return `${snapshot.trackTitle} · 針を置いています…`;
  }
  if (snapshot.status === "playing") {
    return `♪ ${snapshot.trackTitle} · 再生中`;
  }
  return `${snapshot.trackTitle} · 上映開始で再生`;
}

function handleBgmSelect(event: Event): void {
  const select = event.currentTarget;
  if (select instanceof HTMLSelectElement && select.value !== "custom") {
    bgm.selectBuiltInTrack(select.value);
  }
}

function handleBgmVolume(event: Event): void {
  const input = event.currentTarget;
  if (input instanceof HTMLInputElement) {
    bgm.setVolume(Number(input.value) / 100);
  }
}

function handleBgmToggle(): void {
  bgm.toggleEnabled();
}

function handleBgmFileButton(): void {
  bgmFileInput.click();
}

function handleBgmFileChange(): void {
  const file = bgmFileInput.files?.[0];
  if (file !== undefined) {
    bgm.selectLocalFile(file);
  }
  bgmFileInput.value = "";
}

function handleMusicMenuToggle(event: Event): void {
  const openedMenu = event.currentTarget;
  if (!(openedMenu instanceof HTMLDetailsElement) || !openedMenu.open) {
    return;
  }
  musicMenus.forEach((menu) => {
    if (menu !== openedMenu) {
      menu.open = false;
    }
  });
}

function handleDocumentClick(event: MouseEvent): void {
  if (!(event.target instanceof Node)) {
    return;
  }
  if (musicMenus.some((menu) => menu.contains(event.target as Node))) {
    return;
  }
  musicMenus.forEach((menu) => {
    menu.open = false;
  });
}

function restart(): void {
  if (!hasStarted) {
    return;
  }

  setPaused(false);
  game.restart();
  hasHandledGameOver = false;
  newBestBanner.hidden = true;
  previousAudioSnapshot = game.getSnapshot();
  previousTime = performance.now();
  audio.playRestart();
  updateInterface(previousAudioSnapshot);
}

function duringShow(action: () => void): () => void {
  return () => {
    if (hasStarted && !isPaused) {
      action();
    }
  };
}

function togglePause(): void {
  if (!hasStarted || game.getSnapshot().isGameOver) {
    return;
  }
  setPaused(!isPaused);
}

function setPaused(paused: boolean, automatic = false): void {
  if (!hasStarted || (paused && game.getSnapshot().isGameOver) || isPaused === paused) {
    return;
  }

  isPaused = paused;
  touchInput?.cancelActive();
  audio.setSuspended(paused);
  bgm.setSuspended(paused);
  previousTime = performance.now();

  if (paused) {
    pauseReason.textContent = automatic
      ? "画面を離れたため、安全に映写機を止めました"
      : "映写機を一度止めています";
    resumeButton.focus({ preventScroll: true });
  } else {
    pauseButton.focus({ preventScroll: true });
  }

  updateInterface(game.getSnapshot());
}

function handleVisibilityChange(): void {
  if (document.hidden && hasStarted && !game.getSnapshot().isGameOver) {
    setPaused(true, true);
  }
}

function startShow(): void {
  if (hasStarted) {
    return;
  }

  hasStarted = true;
  isPaused = false;
  hasHandledGameOver = false;
  game.restart();
  previousAudioSnapshot = game.getSnapshot();
  previousTime = performance.now();
  bgm.start();
  audio.playStartShow();
  document.body.classList.remove("title-open");
  titleScreen.classList.add("title-screen--leaving");
  startButton.blur();
  updateInterface(previousAudioSnapshot);

  window.setTimeout(() => {
    titleScreen.hidden = true;
  }, 320);
}

function handleTitleKeyDown(event: KeyboardEvent): void {
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("button, input, select, summary") !== null
  ) {
    return;
  }

  if (hasStarted || (event.code !== "Enter" && event.code !== "Space")) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  startShow();
}

const gameControls = {
  moveLeft: duringShow(() => moveHorizontally(-1)),
  moveRight: duringShow(() => moveHorizontally(1)),
  softDrop: duringShow(softDrop),
  rotateClockwise: duringShow(() => rotate("clockwise")),
  rotateCounterClockwise: duringShow(() => rotate("counterclockwise")),
  hardDrop: duringShow(hardDrop),
  hold: duringShow(hold),
  restart,
  togglePause,
  toggleSound,
};

const input = new KeyboardInput(gameControls);
touchInput = new TouchInput(touchControls, gameControls);

startButton.addEventListener("click", startShow);
window.addEventListener("keydown", handleTitleKeyDown, { capture: true });
restartButton.addEventListener("click", restart);
overlayRestartButton.addEventListener("click", restart);
pauseRestartButton.addEventListener("click", restart);
pauseButton.addEventListener("click", togglePause);
resumeButton.addEventListener("click", togglePause);
soundButtons.forEach((button) => {
  button.addEventListener("click", handleSoundButtonClick);
});
bgmSelects.forEach((select) => {
  select.addEventListener("change", handleBgmSelect);
});
bgmVolumeInputs.forEach((input) => {
  input.addEventListener("input", handleBgmVolume);
});
bgmToggleButtons.forEach((button) => {
  button.addEventListener("click", handleBgmToggle);
});
bgmFileButtons.forEach((button) => {
  button.addEventListener("click", handleBgmFileButton);
});
musicMenus.forEach((menu) => {
  menu.addEventListener("toggle", handleMusicMenuToggle);
});
bgmFileInput.addEventListener("change", handleBgmFileChange);
document.addEventListener("click", handleDocumentClick);
document.addEventListener("visibilitychange", handleVisibilityChange);

function moveHorizontally(direction: -1 | 1): void {
  const before = game.getSnapshot();
  if (direction < 0) {
    game.moveLeft();
  } else {
    game.moveRight();
  }

  if (game.getSnapshot().activePiece.position.x !== before.activePiece.position.x) {
    audio.playMove(direction);
  }
}

function softDrop(): void {
  const beforeY = game.getSnapshot().activePiece.position.y;
  game.softDrop();
  if (game.getSnapshot().activePiece.position.y !== beforeY) {
    audio.playSoftDrop();
  }
}

function rotate(direction: "clockwise" | "counterclockwise"): void {
  const beforeRotation = game.getSnapshot().activePiece.rotation;
  if (direction === "clockwise") {
    game.rotateClockwise();
  } else {
    game.rotateCounterClockwise();
  }

  if (game.getSnapshot().activePiece.rotation !== beforeRotation) {
    audio.playRotate(direction);
  }
}

function hold(): void {
  const before = game.getSnapshot();
  game.hold();
  if (before.canHold && !game.getSnapshot().canHold) {
    audio.playHold();
  }
}

function hardDrop(): void {
  const snapshot = game.getSnapshot();
  if (snapshot.isGameOver || snapshot.clearingRows.length > 0) {
    return;
  }

  const distance = snapshot.ghostPosition.y - snapshot.activePiece.position.y;
  audio.playHardDrop(distance);
  game.hardDrop();
}

function syncGameSounds(snapshot: GameSnapshot): void {
  const previous = previousAudioSnapshot;
  const lineClearStarted =
    previous.clearingRows.length === 0 && snapshot.clearingRows.length > 0;
  const finishedLines = snapshot.clearedLines - previous.clearedLines;
  let gameOverPlayed = false;

  if (snapshot.fixedPieces > previous.fixedPieces) {
    if (!previous.isGameOver && snapshot.isGameOver) {
      audio.playGameOver();
      gameOverPlayed = true;
    } else if (lineClearStarted) {
      audio.playLineClearStart(snapshot.clearingRows.length);
    } else {
      audio.playLock();
    }
  }

  if (finishedLines > 0) {
    audio.playLineClearFinish(finishedLines);
  }
  if (snapshot.level > previous.level) {
    audio.playLevelUp();
  }
  if (!gameOverPlayed && !previous.isGameOver && snapshot.isGameOver) {
    audio.playGameOver();
  }

  if (!previous.isGameOver && snapshot.isGameOver) {
    finishGame(snapshot);
  }

  previousAudioSnapshot = snapshot;
}

function finishGame(snapshot: GameSnapshot): void {
  if (hasHandledGameOver) {
    return;
  }

  hasHandledGameOver = true;
  touchInput?.cancelActive();
  const record: GameRecord = {
    score: snapshot.score,
    lines: snapshot.clearedLines,
    level: snapshot.level,
    elapsedSeconds: snapshot.elapsedSeconds,
  };
  const result = records.saveIfBest(record);
  personalBest = result.best;

  resultScore.textContent = formatNumber(record.score, 6);
  resultLines.textContent = formatNumber(record.lines, 3);
  resultLevel.textContent = formatNumber(record.level, 2);
  resultTime.textContent = formatTime(record.elapsedSeconds);
  newBestBanner.hidden = !result.isNewBest;
  updateBestLabels();
  window.setTimeout(() => overlayRestartButton.focus({ preventScroll: true }), 0);
}

function frame(currentTime: number): void {
  const deltaMs = Math.min(currentTime - previousTime, 100);
  previousTime = currentTime;
  if (hasStarted && !isPaused) {
    game.update(deltaMs);
  }
  const snapshot = game.getSnapshot();
  syncGameSounds(snapshot);
  renderer.draw(snapshot);
  updateInterface(snapshot);
  requestAnimationFrame(frame);
}

function updateInterface(snapshot: GameSnapshot): void {
  statusText.textContent = !hasStarted
    ? "上映待ち"
    : isPaused
      ? "休止中"
      : snapshot.isGameOver
        ? "終幕"
        : snapshot.clearingRows.length > 0
          ? "消去中"
          : "上映中";
  statusPill.classList.toggle("status-pill--ended", snapshot.isGameOver);
  statusPill.classList.toggle("status-pill--paused", isPaused);
  pieceLabel.textContent = `出演中 / ${snapshot.activePiece.kind}`;
  scoreValue.textContent = snapshot.score.toString().padStart(6, "0");
  linesValue.textContent = snapshot.clearedLines.toString().padStart(3, "0");
  levelValue.textContent = snapshot.level.toString().padStart(2, "0");

  timeValue.textContent = formatTime(snapshot.elapsedSeconds);

  gameOverPanel.hidden = !hasStarted || !snapshot.isGameOver;
  pausePanel.hidden = !isPaused;
  pauseButton.disabled = !hasStarted || snapshot.isGameOver;
  pauseButton.setAttribute("aria-pressed", String(isPaused));
  pauseButton.setAttribute("aria-label", isPaused ? "上映を再開" : "一時停止");
  pauseButtonLabel.textContent = isPaused ? "再開" : "休止";
  touchPauseSymbol.textContent = isPaused ? "▶" : "Ⅱ";
  touchPauseLabel.textContent = isPaused ? "再開" : "休止";
  touchActionButtons.forEach((button) => {
    const isPauseButton = button.dataset.touchAction === "pause";
    button.disabled =
      !hasStarted || snapshot.isGameOver || (isPaused && !isPauseButton);
  });
}

function updateBestLabels(): void {
  const formattedScore = formatNumber(personalBest.score, 6);
  titleBestScore.textContent = formattedScore;
  resultBestScore.textContent = formattedScore;
}

function formatNumber(value: number, width: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(width, "0");
}

function formatTime(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

updateSoundControls();
updateBestLabels();
updateInterface(game.getSnapshot());
startButton.focus({ preventScroll: true });
requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  input.destroy();
  touchInput?.destroy();
  audio.destroy();
  bgm.destroy();
  destroyPwaInstall();
  unsubscribeFromBgm();
  soundButtons.forEach((button) => {
    button.removeEventListener("click", handleSoundButtonClick);
  });
  bgmSelects.forEach((select) => {
    select.removeEventListener("change", handleBgmSelect);
  });
  bgmVolumeInputs.forEach((input) => {
    input.removeEventListener("input", handleBgmVolume);
  });
  bgmToggleButtons.forEach((button) => {
    button.removeEventListener("click", handleBgmToggle);
  });
  bgmFileButtons.forEach((button) => {
    button.removeEventListener("click", handleBgmFileButton);
  });
  musicMenus.forEach((menu) => {
    menu.removeEventListener("toggle", handleMusicMenuToggle);
  });
  bgmFileInput.removeEventListener("change", handleBgmFileChange);
  document.removeEventListener("click", handleDocumentClick);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  pauseButton.removeEventListener("click", togglePause);
  resumeButton.removeEventListener("click", togglePause);
  pauseRestartButton.removeEventListener("click", restart);
  window.removeEventListener("keydown", handleTitleKeyDown, { capture: true });
});
