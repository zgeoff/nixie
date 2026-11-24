import type { AddressCheck } from '@heynixie/egress';
import { makeAddressCheck, startCheckingProxy } from '@heynixie/egress';
import type { ComputerHandler, ComputerReply } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { evaluateIsolated } from '../screen/evaluate-isolated';
import { handleScreenRequest, readScreenFocus } from '../screen/handle-screen-request';
import type { DesktopDriver, ScreenTabs } from '../screen/types';
import { makeOriginLog } from '../takeover/make-origin-log';
import { actOnTab } from './act-on-tab';
import { downloadTabFile } from './download-tab-file';
import { launchBrowser } from './launch-browser';
import { navigateTab, reloadTab } from './navigate-tab';
import { openTab } from './open-tab';
import { readTabPage } from './read-tab-page';
import { scrollTab } from './scroll-tab';
import { shootTab } from './shoot-tab';
import { trackHoldPages } from './track-hold-pages';
import type { BrowserState, ScanGate } from './types';

export interface BrowserHandlerOptions {
  readonly home: string;
  readonly resolveHost: (host: string) => Promise<readonly string[]>;
  readonly deniedRanges: readonly string[];
  readonly timeZone: string;

  // the guest's scan channel, which scans every request Chromium makes, in a call or between calls
  readonly gate: ScanGate;

  // true for the test build, which has no display
  readonly isHeadless: boolean;
  readonly display?: string;

  // a folder that Chromium's account can write, where its downloads land before the guest reads them
  readonly downloadsPath?: string;

  // replaces the check of the ranges, for a test that serves a page from the loopback
  readonly checkAddress?: AddressCheck;
  readonly executablePath?: string;

  // the desktop that the screen tools drive; without it they refuse
  readonly screen?: {
    readonly makeDriver: (state: BrowserState) => DesktopDriver;

    // how long the display takes to show the result of an input
    readonly settleMs: number;
  };

  // the terminal's visible lines, for the window a hand-back finds in focus; without it the terminal
  // shows no text
  readonly readTerminalText?: () => Promise<string>;
}

const noDisplay: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'failed',
  message: 'the computer has no display',
};

// One browser per guest process, started at its first request and again after it dies. The browser
// reaches the network only through a checking proxy, and every request it makes is scanned by the
// server through the guest's scan channel, whether or not a tool call runs.
export function makeBrowserHandler(options: BrowserHandlerOptions): ComputerHandler {
  const gate = options.gate;
  const ranges = { current: options.deniedRanges };
  let state: BrowserState | null = null;
  let isClosed = false;
  let isProxyUp: Promise<number> | null = null;

  const drivers = new WeakMap<BrowserState, DesktopDriver>();

  const originLog = makeOriginLog();

  const checkAddress: AddressCheck =
    options.checkAddress ?? ((address) => makeAddressCheck(ranges.current)(address));

  const startProxy = async (): Promise<number> => {
    const proxy = await startCheckingProxy({
      checkAddress,
      resolveHost: options.resolveHost,
      scanURL: gate.scan,
      scanText: gate.scanText,
      canTunnel: true,
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
      timeZone: options.timeZone,
      isHeadless: options.isHeadless,
      ...(options.display === undefined ? {} : { display: options.display }),
      ...(options.downloadsPath === undefined ? {} : { downloadsPath: options.downloadsPath }),
      ...(options.executablePath === undefined ? {} : { executablePath: options.executablePath }),
    });

    isClosed = false;

    state.context.on('close', () => {
      isClosed = true;
    });

    trackHoldPages(state, originLog);

    return state;
  };

  return async (request) => {
    if (request.op === 'open' || request.op === 'navigate') {
      ranges.current = request.deniedRanges;
    }

    const browser = await ensure();

    const screen = options.screen;

    const readScreen = (): { driver: DesktopDriver; tabs: ScreenTabs } | null => {
      if (screen === undefined) {
        return null;
      }

      const driver = drivers.get(browser) ?? screen.makeDriver(browser);

      drivers.set(browser, driver);

      const tabs = new Map(
        [...browser.tabs].map(([id, tab]) => [
          id,
          {
            page: {
              url: () => tab.page.url(),
              evaluate: (script: string) => evaluateIsolated(tab.page, script),
            },
          },
        ]),
      );

      return { driver, tabs };
    };

    if (request.op === 'takeoverBegin') {
      const shownURL = await readShownURL(readScreen(), options);

      originLog.begin(shownURL);

      return { kind: 'takeover-begun', ok: true };
    }

    if (request.op === 'takeoverEnd') {
      const origins = originLog.end();

      const now = await readNow(browser, options, readScreen());

      return { kind: 'takeover-ended', ok: true, origins, now };
    }

    if (isScreenRequest(request)) {
      const desktop = readScreen();

      if (desktop === null || screen === undefined) {
        return noDisplay;
      }

      return handleScreenRequest({ ...desktop, settleMs: screen.settleMs }, request);
    }

    return answerTabRequest(browser, request);
  };
}

// The address of the tab in view, or null when none shows or the desktop cannot be read.
async function readShownURL(
  desktop: { driver: DesktopDriver; tabs: ScreenTabs } | null,
  options: BrowserHandlerOptions,
): Promise<string | null> {
  if (desktop === null || options.screen === undefined) {
    return null;
  }

  try {
    const focus = await readScreenFocus({ ...desktop, settleMs: options.screen.settleMs });

    return focus.kind === 'browser' ? focus.url : null;
  } catch {
    return null;
  }
}

type NowReply = Extract<ComputerReply, { kind: 'takeover-ended' }>['now'];

// how much of the page in focus a hand-back reads, as the first part of a page read does
const nowTextBytes = 4000;

// The window that has focus as a hand-back reports it: a browser tab with its text as a page read
// gives it, the terminal with its visible lines, or another window with nothing. A desktop that
// cannot be read, or has no display, reports another window.
async function readNow(
  browser: BrowserState,
  options: BrowserHandlerOptions,
  desktop: { driver: DesktopDriver; tabs: ScreenTabs } | null,
): Promise<NowReply> {
  if (desktop === null || options.screen === undefined) {
    return { kind: 'other' };
  }

  try {
    const focus = await readScreenFocus({ ...desktop, settleMs: options.screen.settleMs });

    if (focus.kind === 'terminal') {
      const text = await options.readTerminalText?.();

      return { kind: 'terminal', text: text ?? '' };
    }

    const tab = focus.kind === 'browser' ? browser.tabs.get(focus.tab) : undefined;

    if (focus.kind !== 'browser' || tab === undefined) {
      return { kind: 'other' };
    }

    const read = await readTabPage(focus.tab, tab, {
      mode: 'text',
      textBytes: nowTextBytes,
      isDiskNew: false,
      blocked: null,
    });

    return { kind: 'browser', tab: focus.tab, text: read.page.text };
  } catch {
    return { kind: 'other' };
  }
}

type ScreenOp = Extract<
  Parameters<ComputerHandler>[0],
  { op: 'desktopShot' | 'screenScroll' | 'screenBind' | 'screenAct' }
>;

function isScreenRequest(request: Parameters<ComputerHandler>[0]): request is ScreenOp {
  return (
    request.op === 'desktopShot' ||
    request.op === 'screenScroll' ||
    request.op === 'screenBind' ||
    request.op === 'screenAct'
  );
}

// A page that closes or moves under a call fails the call. A throw would end the guest, and the
// server would see its output close with no reply.
async function answerTabRequest(
  state: BrowserState,
  request: Parameters<ComputerHandler>[0],
): Promise<ComputerReply> {
  try {
    return await handleRequest(state, request);
  } catch (error) {
    return {
      kind: 'failed',
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
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
        blocked: null,
      });
    })
    .with({ op: 'navigate' }, (navigate) => {
      const tab = state.tabs.get(navigate.tab);

      return tab === undefined
        ? Promise.resolve(tabGone)
        : navigateTab(navigate.tab, tab, navigate);
    })
    .with({ op: 'reload' }, (reload) => {
      const tab = state.tabs.get(reload.tab);

      return tab === undefined ? Promise.resolve(tabGone) : reloadTab(reload.tab, tab, reload);
    })
    .with({ op: 'screenshot' }, (shot) => {
      const tab = state.tabs.get(shot.tab);

      if (tab === undefined) {
        return Promise.resolve(tabGone);
      }

      return shootTab(shot.tab, tab, shot.control);
    })
    .with({ op: 'scroll' }, (scroll) => {
      const tab = state.tabs.get(scroll.tab);

      if (tab === undefined) {
        return Promise.resolve(tabGone);
      }

      return scrollTab(scroll.tab, tab, scroll.to);
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
    .with(
      { op: 'run' },
      { op: 'readFile' },
      { op: 'writeFile' },
      { op: 'desktopShot' },
      { op: 'screenScroll' },
      { op: 'screenBind' },
      { op: 'screenAct' },
      { op: 'takeoverBegin' },
      { op: 'takeoverEnd' },
      () => Promise.resolve(fileOnlyReply),
    )
    .exhaustive();
}
