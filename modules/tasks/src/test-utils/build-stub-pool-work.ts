interface HeldMiss {
  readonly started: Promise<void>;

  readonly release: () => void;
}

export interface StubPoolWork {
  readonly queue: string[];

  readonly running: ReadonlyMap<string, () => void>;
  readonly finished: readonly string[];

  readonly peak: { readonly running: number };
  readonly claim: () => Promise<string | null>;
  readonly run: (item: string) => Promise<void>;

  readonly releaseAll: () => void;

  readonly holdNextMiss: () => HeldMiss;
}

interface PendingMiss {
  readonly gate: Promise<void>;
  readonly start: () => void;
}

export function buildStubPoolWork(work: readonly string[]): StubPoolWork {
  const queue = [...work];

  const running = new Map<string, () => void>();

  const finished: string[] = [];
  const peak = { running: 0 };
  const pending: { miss: PendingMiss | null } = { miss: null };

  return {
    queue,
    running,
    finished,
    peak,
    claim: async () => {
      const miss = pending.miss;

      if (miss === null) {
        return queue.shift() ?? null;
      }

      pending.miss = null;

      miss.start();

      await miss.gate;

      return null;
    },
    run: async (item) => {
      const held = Promise.withResolvers<void>();

      running.set(item, held.resolve);

      peak.running = Math.max(peak.running, running.size);

      await held.promise;

      running.delete(item);
      finished.push(item);
    },
    releaseAll: () => {
      for (const release of running.values()) {
        release();
      }
    },
    holdNextMiss: () => {
      const gate = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();

      pending.miss = { gate: gate.promise, start: started.resolve };

      return { started: started.promise, release: gate.resolve };
    },
  };
}
