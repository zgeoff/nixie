import { watch } from 'node:fs';

// Calls onChange whenever any process writes nixie.db's WAL file, as every commit does. It watches
// the directory, so the file may come and go. A filesystem that cannot watch gives no calls, and
// the caller's polling covers it.
export function subscribeToWAL(dataDir: string, onChange: () => void): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const resetTimers = (): void => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  // SQLite writes a commit's frames, syncs them, and only then publishes the commit, so a read on
  // the write event can come too early, and each change calls onChange again as the commit settles
  const onWrite = (): void => {
    resetTimers();
    onChange();
    for (const delay of SETTLE_DELAYS_MS) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        onChange();
      }, delay);

      timers.add(timer);
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
      resetTimers();
      watcher.close();
    };
  } catch {
    return () => {};
  }
}

const SETTLE_DELAYS_MS = [10, 50, 250];
