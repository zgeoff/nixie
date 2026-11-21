import type { AskScan } from '@heynixie/wire';

export interface ScanGate {
  // set while a request runs, null between requests
  current: AskScan | null;

  // scans one URL; the server answers each hop in order, so scans run one at a time
  readonly scan: (url: string) => Promise<void>;
}

export function makeScanGate(): ScanGate {
  let queue: Promise<void> = Promise.resolve();

  const gate: ScanGate = {
    current: null,
    scan: async (url) => {
      const previous = queue;
      const done = Promise.withResolvers<void>();

      queue = done.promise;

      await previous;

      try {
        if (gate.current === null) {
          throw new Error('no call is running');
        }

        await gate.current(url);
      } finally {
        done.resolve();
      }
    },
  };

  return gate;
}
