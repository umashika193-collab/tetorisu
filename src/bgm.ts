const BGM_VOLUME_STORAGE_KEY = "tetorisu:bgm-volume";
const BGM_TRACK_STORAGE_KEY = "tetorisu:bgm-track";
const BGM_ENABLED_STORAGE_KEY = "tetorisu:bgm-enabled";
const DEFAULT_VOLUME = 0.34;
const FADE_DURATION_MS = 420;

export interface BgmTrack {
  id: string;
  title: string;
  url: string;
}

export const BUILT_IN_BGM: readonly BgmTrack[] = [
  {
    id: "korobeiniki",
    title: "Коробе́йники",
    url: new URL("../oto/Коробе́йники.mp3", import.meta.url).href,
  },
  {
    id: "bwv114",
    title: "BWV 114 · Piano",
    url: new URL("../oto/BWV114_5_piano.mp3", import.meta.url).href,
  },
  {
    id: "test1",
    title: "test1",
    url: new URL("../oto/test1.mp3", import.meta.url).href,
  },
  {
    id: "test2",
    title: "test2",
    url: new URL("../oto/test2.mp3", import.meta.url).href,
  },
  {
    id: "test3",
    title: "test3",
    url: new URL("../oto/test3.mp3", import.meta.url).href,
  },
] as const;

export type BgmStatus = "ready" | "loading" | "playing" | "paused" | "error";

export interface BgmSnapshot {
  enabled: boolean;
  errorMessage: string | null;
  isCustomTrack: boolean;
  status: BgmStatus;
  suspended: boolean;
  trackId: string;
  trackTitle: string;
  volume: number;
}

type BgmListener = (snapshot: BgmSnapshot) => void;

/**
 * 内蔵曲と利用者のローカル音源を扱う、二台掛けの伴奏再生機。
 * ローカル音源は Object URL だけで再生し、ブラウザー外へ送信しない。
 */
export class BgmPlayer {
  private readonly players: [HTMLAudioElement, HTMLAudioElement];
  private readonly listeners = new Set<BgmListener>();
  private activePlayerIndex: 0 | 1 = 0;
  private currentTrack = this.readInitialTrack();
  private volume = this.readVolumePreference();
  private enabled = this.readEnabledPreference();
  private masterMuted = false;
  private suspended = false;
  private started = false;
  private status: BgmStatus = "ready";
  private errorMessage: string | null = null;
  private fadeFrame: number | null = null;
  private switchGeneration = 0;
  private customObjectUrl: string | null = null;

  public constructor() {
    this.players = [this.createPlayer(), this.createPlayer()];
    this.preparePlayer(this.players[0], this.currentTrack.url);
    this.players[0].volume = this.volume;
  }

  public getSnapshot(): BgmSnapshot {
    return {
      enabled: this.enabled,
      errorMessage: this.errorMessage,
      isCustomTrack: this.currentTrack.id === "custom",
      status: this.status,
      suspended: this.suspended,
      trackId: this.currentTrack.id,
      trackTitle: this.currentTrack.title,
      volume: this.volume,
    };
  }

  public subscribe(listener: BgmListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    if (this.enabled && !this.suspended) {
      void this.playActivePlayer();
    } else {
      this.status = "paused";
      this.emit();
    }
  }

  public setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    this.players.forEach((player) => {
      player.muted = muted;
    });

    if (!muted && this.started && this.enabled && !this.suspended) {
      void this.playActivePlayer();
    }
    this.emit();
  }

  public toggleEnabled(): boolean {
    this.enabled = !this.enabled;
    this.writePreference(BGM_ENABLED_STORAGE_KEY, String(this.enabled));

    if (!this.enabled) {
      this.pauseWithFade();
    } else if (this.started && !this.suspended) {
      void this.playActivePlayer();
    } else {
      this.status = "ready";
      this.emit();
    }

    return this.enabled;
  }

  /** ゲームの一時停止に合わせて、利用者の伴奏設定を変えず再生だけ止める。 */
  public setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) {
      return;
    }

    this.suspended = suspended;
    if (suspended) {
      if (this.started && this.enabled) {
        this.pauseWithFade();
      } else {
        this.status = "paused";
        this.emit();
      }
    } else if (this.started && this.enabled) {
      void this.playActivePlayer();
    } else {
      this.status = this.enabled ? "ready" : "paused";
      this.emit();
    }
  }

  public setVolume(volume: number): void {
    this.volume = clamp(volume, 0, 1);
    this.writePreference(BGM_VOLUME_STORAGE_KEY, String(this.volume));

    const activePlayer = this.players[this.activePlayerIndex];
    activePlayer.volume = this.volume;
    this.emit();
  }

  public selectBuiltInTrack(trackId: string): boolean {
    const track = BUILT_IN_BGM.find((candidate) => candidate.id === trackId);
    if (track === undefined) {
      return false;
    }

    this.writePreference(BGM_TRACK_STORAGE_KEY, track.id);
    this.switchTrack(track);
    return true;
  }

  public selectLocalFile(file: File): void {
    const nextUrl = URL.createObjectURL(file);
    const previousCustomUrl = this.customObjectUrl;
    this.customObjectUrl = nextUrl;
    this.switchTrack(
      {
        id: "custom",
        title: stripFileExtension(file.name) || "手持ち曲",
        url: nextUrl,
      },
      previousCustomUrl,
    );
  }

  public destroy(): void {
    this.switchGeneration += 1;
    this.cancelFade();
    this.players.forEach((player) => {
      player.pause();
      player.removeAttribute("src");
      player.load();
    });
    if (this.customObjectUrl !== null) {
      URL.revokeObjectURL(this.customObjectUrl);
    }
    this.listeners.clear();
  }

  private async playActivePlayer(): Promise<void> {
    if (!this.started || !this.enabled || this.suspended) {
      this.status = this.started ? "paused" : "ready";
      this.emit();
      return;
    }

    const player = this.players[this.activePlayerIndex];
    player.muted = this.masterMuted;
    player.volume = this.volume;
    this.errorMessage = null;
    this.status = "loading";
    this.emit();

    try {
      await player.play();
      if (this.enabled && !this.suspended) {
        this.status = "playing";
      } else {
        player.pause();
        this.status = "paused";
      }
    } catch {
      this.status = "error";
      this.errorMessage = "この音源は再生できませんでした";
    }
    this.emit();
  }

  private switchTrack(track: BgmTrack, obsoleteObjectUrl: string | null = null): void {
    if (track.id === this.currentTrack.id && track.url === this.currentTrack.url) {
      return;
    }

    const generation = ++this.switchGeneration;
    const oldPlayer = this.players[this.activePlayerIndex];
    const nextPlayerIndex: 0 | 1 = this.activePlayerIndex === 0 ? 1 : 0;
    const nextPlayer = this.players[nextPlayerIndex];

    this.cancelFade();
    nextPlayer.pause();
    this.preparePlayer(nextPlayer, track.url);
    nextPlayer.volume = 0;
    nextPlayer.muted = this.masterMuted;
    this.currentTrack = track;
    this.errorMessage = null;
    this.status =
      this.started && this.enabled && !this.suspended
        ? "loading"
        : this.started || !this.enabled || this.suspended
          ? "paused"
          : "ready";
    this.emit();

    if (!this.started || !this.enabled || this.suspended) {
      oldPlayer.pause();
      oldPlayer.currentTime = 0;
      this.activePlayerIndex = nextPlayerIndex;
      nextPlayer.volume = this.volume;
      this.releaseObjectUrl(obsoleteObjectUrl);
      return;
    }

    void nextPlayer
      .play()
      .then(() => {
        if (generation !== this.switchGeneration) {
          nextPlayer.pause();
          return;
        }

        this.activePlayerIndex = nextPlayerIndex;
        this.status = "playing";
        this.crossFade(oldPlayer, nextPlayer, obsoleteObjectUrl);
        this.emit();
      })
      .catch(() => {
        if (generation !== this.switchGeneration) {
          return;
        }
        oldPlayer.pause();
        oldPlayer.currentTime = 0;
        this.activePlayerIndex = nextPlayerIndex;
        this.status = "error";
        this.errorMessage = "この音源は再生できませんでした";
        this.releaseObjectUrl(obsoleteObjectUrl);
        this.emit();
      });
  }

  private crossFade(
    oldPlayer: HTMLAudioElement,
    nextPlayer: HTMLAudioElement,
    obsoleteObjectUrl: string | null,
  ): void {
    const startedAt = performance.now();
    const targetVolume = this.volume;
    const oldStartVolume = oldPlayer.volume;

    const tick = (now: number): void => {
      const progress = clamp((now - startedAt) / FADE_DURATION_MS, 0, 1);
      oldPlayer.volume = oldStartVolume * (1 - progress);
      nextPlayer.volume = targetVolume * progress;

      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(tick);
        return;
      }

      this.fadeFrame = null;
      oldPlayer.pause();
      oldPlayer.currentTime = 0;
      this.releaseObjectUrl(obsoleteObjectUrl);
    };

    this.fadeFrame = requestAnimationFrame(tick);
  }

  private pauseWithFade(): void {
    this.switchGeneration += 1;
    this.cancelFade();
    const player = this.players[this.activePlayerIndex];
    this.players.forEach((candidate, index) => {
      if (index !== this.activePlayerIndex) {
        candidate.pause();
        candidate.volume = this.volume;
      }
    });
    const startedAt = performance.now();
    const startVolume = player.volume;
    this.status = "paused";
    this.emit();

    const tick = (now: number): void => {
      const progress = clamp((now - startedAt) / 180, 0, 1);
      player.volume = startVolume * (1 - progress);
      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(tick);
        return;
      }
      this.fadeFrame = null;
      player.pause();
      player.volume = this.volume;
    };
    this.fadeFrame = requestAnimationFrame(tick);
  }

  private cancelFade(): void {
    if (this.fadeFrame !== null) {
      cancelAnimationFrame(this.fadeFrame);
      this.fadeFrame = null;
    }
  }

  private preparePlayer(player: HTMLAudioElement, url: string): void {
    player.src = url;
    player.currentTime = 0;
    player.load();
  }

  private createPlayer(): HTMLAudioElement {
    const player = new Audio();
    player.loop = true;
    player.preload = "auto";
    player.setAttribute("playsinline", "");
    player.muted = this.masterMuted;
    return player;
  }

  private readInitialTrack(): BgmTrack {
    const storedId = this.readPreference(BGM_TRACK_STORAGE_KEY);
    return BUILT_IN_BGM.find((track) => track.id === storedId) ?? BUILT_IN_BGM[0]!;
  }

  private readVolumePreference(): number {
    const storedPreference = this.readPreference(BGM_VOLUME_STORAGE_KEY);
    if (storedPreference === null) {
      return DEFAULT_VOLUME;
    }

    const storedVolume = Number(storedPreference);
    return Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1
      ? storedVolume
      : DEFAULT_VOLUME;
  }

  private readEnabledPreference(): boolean {
    return this.readPreference(BGM_ENABLED_STORAGE_KEY) !== "false";
  }

  private readPreference(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writePreference(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // 保存できない環境でも、その場の操作は有効にする。
    }
  }

  private releaseObjectUrl(url: string | null): void {
    if (url !== null && url !== this.customObjectUrl) {
      URL.revokeObjectURL(url);
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
