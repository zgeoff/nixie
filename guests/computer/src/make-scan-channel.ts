import type { AskScan, AskScanText, ComputerScanAsks } from '@heynixie/wire';

export interface ScanChannel {
  // scans one URL, or the text of a request's headers and body, with the server; each rejects when
  // the server refuses it
  readonly scan: AskScan;
  readonly scanText: AskScanText;

  // opens the channel, with the asks that the wire gives the guest before its first frame
  readonly bind: (asks: ComputerScanAsks) => void;
}

// The guest's one way to ask the server for a scan, which stays open for the guest's life. Chromium
// and the terminal's proxy hold it from their start, and a request that is made while no tool call
// runs is scanned like any other. Nothing is allowed through before the channel opens.
export function makeScanChannel(): ScanChannel {
  const bound: { current: ComputerScanAsks | null } = { current: null };

  const requireAsks = (): ComputerScanAsks => {
    if (bound.current === null) {
      throw new Error('the scan channel is not open');
    }

    return bound.current;
  };

  return {
    scan: (url) => Promise.try(() => requireAsks().askScan(url)),
    scanText: (text) => Promise.try(() => requireAsks().askScanText(text)),
    bind: (asks) => {
      bound.current = asks;
    },
  };
}
