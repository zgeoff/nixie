import type { AskScan, AskScanText } from '@heynixie/wire';

interface ScanAsks {
  readonly askScan: AskScan;
  readonly askScanText: AskScanText;
}

export interface ScanGate {
  // set while a request runs, null between requests
  current: ScanAsks | null;

  // scans one URL; the server answers each hop in order, so scans run one at a time
  readonly scan: (url: string) => Promise<void>;

  // scans the headers and body of one request, in the same order
  readonly scanText: (text: string) => Promise<void>;
}

export function makeScanGate(): ScanGate {
  let queue: Promise<void> = Promise.resolve();

  const runInTurn = async (
    ask: (asks: ScanAsks) => Promise<void>,
    current: () => ScanAsks | null,
  ): Promise<void> => {
    const previous = queue;
    const done = Promise.withResolvers<void>();

    queue = done.promise;

    await previous;

    try {
      const asks = current();

      if (asks === null) {
        throw new Error('no call is running');
      }

      await ask(asks);
    } finally {
      done.resolve();
    }
  };

  const gate: ScanGate = {
    current: null,
    scan: (url) =>
      runInTurn(
        (asks) => asks.askScan(url),
        () => gate.current,
      ),
    scanText: (text) =>
      runInTurn(
        (asks) => asks.askScanText(text),
        () => gate.current,
      ),
  };

  return gate;
}
