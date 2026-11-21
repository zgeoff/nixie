import type { AddressCheck } from '@heynixie/egress';
import { makeAddressCheck, startCheckingProxy } from '@heynixie/egress';
import type { ComputerHandler, ComputerReply } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { actOnTab } from './act-on-tab';
import { downloadTabFile } from './download-tab-file';
import { launchBrowser } from './launch-browser';
import { makeScanGate } from './make-scan-gate';
import { openTab } from './open-tab';
import { readTabPage } from './read-tab-page';
import { shootTab } from './shoot-tab';
import type { BrowserState } from './types';

export interface BrowserHandlerOptions {
  readonly home: string;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly deniedRanges: readonly string[];

  // replaces the check of the ranges, for a test that serves a page from the loopback
  readonly checkAddress?: AddressCheck;
  readonly executablePath?: string;
}

// One browser per guest process, started at its first request and again after it dies. The browser
// reaches the network only through a checking proxy, and a navigation asks the server to scan its
// URL while a request runs.
export function makeBrowserHandler(options: BrowserHandlerOptions): ComputerHandler {
  const gate = makeScanGate();
  const ranges = { current: options.deniedRanges };
  let state: BrowserState | null = null;
  let isClosed = false;
  let isProxyUp: Promise<number> | null = null;

  const checkAddress: AddressCheck =
    options.checkAddress ?? ((address) => makeAddressCheck(ranges.current)(address));

  const startProxy = async (): Promise<number> => {
    const proxy = await startCheckingProxy({
      checkAddress,
      resolveHost: options.resolveHost,
      scanURL: gate.scan,
    });

    return proxy.port;
  };

  const ensure = async (): Promise<BrowserState> => {
    if (state !== null && !isClosed) {
      return state;
    }

    isProxyUp ??= startProxy();

    const proxyPort = await isProxyUp;

    state = await launchBrowser({
      home: options.home,
      proxyPort,
      gate,
      ...(options.executablePath === undefined ? {} : { executablePath: options.executablePath }),
    });

    isClosed = false;

    state.context.on('close', () => {
      isClosed = true;
    });

    return state;
  };

  return async (request, askScan) => {
    gate.current = askScan;

    if (request.op === 'open') {
      ranges.current = request.deniedRanges;
    }

    try {
      const browser = await ensure();

      return await handleRequest(browser, request);
    } finally {
      gate.current = null;
    }
  };
}

const tabGone: ComputerReply = { kind: 'failed', ok: false, reason: 'tab_gone' };

const fileOnlyReply: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'failed',
  message: 'the browser holds no files',
};

function handleRequest(
  state: BrowserState,
  request: Parameters<ComputerHandler>[0],
): Promise<ComputerReply> {
  return match(request)
    .with({ op: 'open' }, (open) => openTab(state, open))
    .with({ op: 'read' }, (read) => {
      const tab = state.tabs.get(read.tab);

      if (tab === undefined) {
        return Promise.resolve(tabGone);
      }

      return readTabPage(read.tab, tab, {
        mode: read.mode,
        textBytes: 3 * 65_536,
        isDiskNew: false,
      });
    })
    .with({ op: 'screenshot' }, (shot) => {
      const tab = state.tabs.get(shot.tab);

      if (tab === undefined) {
        return Promise.resolve(tabGone);
      }

      return shootTab(shot.tab, tab);
    })
    .with({ op: 'act' }, (act) => {
      const tab = state.tabs.get(act.tab);

      if (tab === undefined) {
        return Promise.resolve(tabGone);
      }

      return actOnTab(act.tab, tab, act);
    })
    .with({ op: 'close' }, async (close) => {
      const tab = state.tabs.get(close.tab);

      if (tab === undefined) {
        return tabGone;
      }

      state.tabs.delete(close.tab);

      await tab.page.close();

      return { kind: 'closed' as const, ok: true as const };
    })
    .with({ op: 'download' }, (download) => {
      const tab = state.tabs.get(download.tab);

      if (tab === undefined) {
        return Promise.resolve(tabGone);
      }

      return downloadTabFile(tab, download.element);
    })
    .with({ op: 'run' }, { op: 'readFile' }, { op: 'writeFile' }, () =>
      Promise.resolve(fileOnlyReply),
    )
    .exhaustive();
}
