import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BgmPlayer } from "./bgm";

class FakeAudio {
  public loop = false;
  public preload = "";
  public muted = false;
  public volume = 1;
  public src = "";
  public currentTime = 0;

  public load(): void {}
  public pause = vi.fn();
  public play = vi.fn((): Promise<void> => {
    return Promise.resolve();
  });
  public setAttribute(): void {}
  public removeAttribute(attribute: string): void {
    if (attribute === "src") {
      this.src = "";
    }
  }
}

describe("BgmPlayer", () => {
  const storedValues = new Map<string, string>();

  beforeEach(() => {
    storedValues.clear();
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("初回はКоробе́йникиを34%で選ぶ", () => {
    const player = new BgmPlayer();

    expect(player.getSnapshot()).toMatchObject({
      enabled: true,
      trackId: "korobeiniki",
      trackTitle: "Коробе́йники",
      volume: 0.34,
    });

    player.destroy();
  });

  it("内蔵曲と音量の選択を保存する", () => {
    const player = new BgmPlayer();

    expect(player.selectBuiltInTrack("test2")).toBe(true);
    player.setVolume(0.57);

    const restoredPlayer = new BgmPlayer();
    expect(restoredPlayer.getSnapshot()).toMatchObject({
      trackId: "test2",
      volume: 0.57,
    });

    player.destroy();
    restoredPlayer.destroy();
  });

  it("手持ち曲を端末内のObject URLとして扱う", () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:local-track");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const player = new BgmPlayer();

    player.selectLocalFile({ name: "わたしの曲.flac" } as File);

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(player.getSnapshot()).toMatchObject({
      isCustomTrack: true,
      trackId: "custom",
      trackTitle: "わたしの曲",
    });

    player.destroy();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:local-track");
  });

  it("ゲーム休止中だけ再生を止め、伴奏設定は維持する", async () => {
    const player = new BgmPlayer();
    player.start();
    await Promise.resolve();

    player.setSuspended(true);
    expect(player.getSnapshot()).toMatchObject({
      enabled: true,
      status: "paused",
      suspended: true,
    });

    player.setSuspended(false);
    await Promise.resolve();
    expect(player.getSnapshot()).toMatchObject({
      enabled: true,
      status: "playing",
      suspended: false,
    });

    player.destroy();
  });
});
