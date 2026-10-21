import { watch } from 'node:fs';
import type { Clock } from '@heynixie/clock';

const SETTLE_DELAYS_MS = [10, 50, 250];

export function subscribeToWAL(dataDir: string, clock: Clock, onChange: () => void): () => void {
  const settling = { controller: new AbortController() };

  const resetSettling = (): void => {
    settling.controller.abort();

    settling.controller = new AbortController();
  };

  // SQLite writes a commit's frames, syncs them, and only then publishes the commit, so a read on
  // the write event can come too early to see it.
  const onWrite = (): void => {
    resetSettling();
    onChange();

    for (const delay of SETTLE_DELAYS_MS) {
      void emitAfter(clock, { delayMs: delay, signal: settling.controller.signal }, onChange);
    }
  };

  try {
    const watcher = watch(dataDir, (_, filename) => {
      if (filename === 'nixie.db-wal') {
        onWrite();
      }
    });

    watcher.on('error', () => {
      watcher.close();
    });

    return () => {
      settling.controller.abort();
      watcher.close();
    };
  } catch {
    return () => {};
  }
}

interface SettleCall {
  readonly delayMs: number;
  readonly signal: AbortSignal;
}

async function emitAfter(clock: Clock, call: SettleCall, onChange: () => void): Promise<void> {
  await clock.sleep(call.delayMs, call.signal);

  if (!call.signal.aborted) {
    onChange();
  }
}
