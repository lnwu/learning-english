import { afterAll, afterEach, beforeAll, beforeEach, spyOn } from "bun:test";
import {
  initialMemory,
  initialStats,
  type ReviewLogEntry,
  type WordMemory,
  type WordStats,
} from "@/lib/masteryModel";
import type { QueueStorage, SyncQueueItem } from "@/lib/queueStorage";
import type { WordDocSnapshot } from "@/lib/wordsRepo";
import type { SyncableWordData, WordData } from "@/lib/wordsStore";

export const makeMemory = (overrides: Partial<WordMemory> = {}): WordMemory => ({
  ...initialMemory(0),
  ...overrides,
});

export const makeStats = (overrides: Partial<WordStats> = {}): WordStats => ({
  ...initialStats(),
  ...overrides,
});

export const makeWordData = (word: string, overrides: Partial<WordData> = {}): WordData => ({
  word,
  translation: `${word}-中文`,
  sources: [],
  memory: makeMemory(),
  stats: makeStats(),
  inputTimes: [],
  reviews: [],
  createdAt: new Date(0),
  id: `id-${word}`,
  ...overrides,
});

export const makeDoc = (
  word: string,
  overrides: Record<string, unknown> = {},
): WordDocSnapshot => ({
  id: `id-${word}`,
  data: () => ({
    word,
    translation: `${word}译`,
    memory: initialMemory(0),
    stats: initialStats(),
    inputTimes: [],
    reviews: [],
    createdAt: { toDate: () => new Date("2026-01-01T00:00:00") },
    ...overrides,
  }),
});

export const memoryAt = (at: number | null): WordMemory => ({
  ...initialMemory(0),
  stability: at === null ? 0 : 2.3065,
  difficulty: at === null ? 0 : 2.1181,
  state: at === null ? "new" : "review",
  due: at ?? 0,
  lastReviewAt: at,
  lastGrade: at === null ? null : 3,
  reps: at === null ? 0 : 1,
});

export const reviewEntry = (id: string, at: number): ReviewLogEntry => ({
  id,
  at,
  g: 3,
  h: false,
  r: null,
  s: 2.3065,
  d: 2.1181,
});

export const makeSyncable = (
  at = 1000,
  overrides: Partial<SyncableWordData> = {},
): SyncableWordData => ({
  memory: memoryAt(at),
  stats: {
    ...initialStats(),
    reviewDays: 1,
    lastReviewDay: "2026-01-01",
    dailyReviews: 1,
  },
  inputTimes: [1],
  reviews: [reviewEntry("r1", at)],
  ...overrides,
});

export const makeQueueItem = (
  wordId: string,
  word: string,
  overrides: Partial<SyncQueueItem> = {},
): SyncQueueItem => ({
  id: `q-${wordId}`,
  type: "attempt",
  word,
  wordId,
  data: makeSyncable(),
  timestamp: 1000,
  retryCount: 0,
  ...overrides,
});

let tokenNonce = 0;

export const makeToken = (
  uid: string,
  expSeconds: number = Math.floor(Date.now() / 1000) + 3600,
): string => {
  tokenNonce += 1;
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ user_id: uid, exp: expSeconds, jti: tokenNonce }),
  ).toString("base64url");
  return header + "." + payload + ".signature";
};

export const useEnvVar = (name: string, value: string): void => {
  const original = process.env[name];

  beforeEach(() => {
    process.env[name] = value;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  });
};

const REDIS_ENV_KEYS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

export const useNoRedisEnv = (): void => {
  const saved = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of REDIS_ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterAll(() => {
    for (const key of REDIS_ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
};

export const useRestoredFetch = (): void => {
  const original = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = original;
  });
};

export const useConsoleSpy = (method: "error" | "warn"): void => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(console, method).mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });
};

export const mockIdentityToolkitFetch = (
  options: { ok?: boolean; localId?: string; network?: boolean } = {},
): { calls: number } => {
  const { ok = true, localId = "uid-1", network = false } = options;
  const state = { calls: 0 };

  globalThis.fetch = (async () => {
    state.calls += 1;
    if (network) {
      throw new Error("network down");
    }
    return {
      ok,
      json: async () => ({ users: ok && localId ? [{ localId }] : [] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return state;
};

export const createMemoryQueueStorage = (): QueueStorage => {
  let items: SyncQueueItem[] = [];

  return {
    load: () => [...items],
    get: (wordId) => items.find((item) => item.wordId === wordId) ?? null,
    save: (item) => {
      items = [...items.filter((entry) => entry.wordId !== item.wordId), item];
    },
    removeByIds: (ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      items = items.filter((item) => !idSet.has(item.id));
    },
    clear: () => {
      items = [];
    },
    usingMemoryFallback: false,
  };
};
