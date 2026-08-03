const PERSONAL_BEST_STORAGE_KEY = "tetorisu:personal-best";

export interface GameRecord {
  score: number;
  lines: number;
  level: number;
  elapsedSeconds: number;
}

export interface RecordResult {
  best: GameRecord;
  isNewBest: boolean;
}

const EMPTY_RECORD: GameRecord = {
  score: 0,
  lines: 0,
  level: 1,
  elapsedSeconds: 0,
};

type RecordStorage = Pick<Storage, "getItem" | "setItem">;

/** 端末内だけに自己ベストを保存する記録帳。 */
export class PersonalBestStore {
  private readonly storage: RecordStorage | null;

  public constructor(storage: RecordStorage | null = getBrowserStorage()) {
    this.storage = storage;
  }

  public load(): GameRecord {
    if (this.storage === null) {
      return { ...EMPTY_RECORD };
    }

    try {
      const stored = this.storage.getItem(PERSONAL_BEST_STORAGE_KEY);
      if (stored === null) {
        return { ...EMPTY_RECORD };
      }

      const candidate: unknown = JSON.parse(stored);
      return isGameRecord(candidate) ? candidate : { ...EMPTY_RECORD };
    } catch {
      return { ...EMPTY_RECORD };
    }
  }

  public saveIfBest(record: GameRecord): RecordResult {
    const normalized = normalizeRecord(record);
    const current = this.load();
    const isNewBest = normalized.score > current.score;

    if (!isNewBest) {
      return { best: current, isNewBest: false };
    }

    try {
      this.storage?.setItem(PERSONAL_BEST_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // 保存できない環境でも、その場の結果表示は続ける。
    }

    return { best: normalized, isNewBest: true };
  }
}

function getBrowserStorage(): RecordStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeRecord(record: GameRecord): GameRecord {
  return {
    score: normalizeCount(record.score),
    lines: normalizeCount(record.lines),
    level: Math.max(1, normalizeCount(record.level)),
    elapsedSeconds: normalizeCount(record.elapsedSeconds),
  };
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isGameRecord(value: unknown): value is GameRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Partial<GameRecord>;
  return (
    isNonNegativeInteger(record.score) &&
    isNonNegativeInteger(record.lines) &&
    isNonNegativeInteger(record.elapsedSeconds) &&
    isNonNegativeInteger(record.level) &&
    record.level >= 1
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
