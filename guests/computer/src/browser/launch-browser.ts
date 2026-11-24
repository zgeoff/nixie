import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request } from 'playwright-core';
import { chromium } from 'playwright-core';
import { viewport } from './shoot-tab';
import type { BrowserState, ScanGate } from './types';

export interface BrowserLaunch {
  readonly home: string;
  readonly proxyPort: number;
  readonly gate: ScanGate;
  readonly timeZone: string;

  // true for the test build, which has no display; false opens Chromium on `display`
  readonly isHeadless: boolean;

  // the X display that a headed Chromium opens on, such as :99
  readonly display?: string;
  readonly downloadsPath?: string;
  readonly executablePath?: string;
}

// Starts Chromium on the profile in the home folder. Every connection goes to the checking proxy,
// QUIC and WebRTC are off, and each request has its headers and body scanned here through the
// guest's scan channel, because the proxy cannot read them inside an encrypted tunnel.
export async function launchBrowser(launch: BrowserLaunch): Promise<BrowserState> {
  const profile = join(launch.home, 'profile');
  const marker = join(launch.home, '.nixie-disk-used');

  await mkdir(profile, { recursive: true });

  const isUsed = await stat(marker)
    .then(() => true)
    .catch(() => false);

  await writeFile(marker, '');

  const context = await chromium.launchPersistentContext(profile, {
    headless: launch.isHeadless,
    viewport: launch.isHeadless ? viewport : null,
    ...(launch.display === undefined
      ? {}
      : { env: { ...readStringEnv(), DISPLAY: launch.display } }),
    timezoneId: launch.timeZone,
    ...(launch.executablePath === undefined ? {} : { executablePath: launch.executablePath }),
    acceptDownloads: true,
    ...(launch.downloadsPath === undefined ? {} : { downloadsPath: launch.downloadsPath }),
    serviceWorkers: 'block',
    proxy: { server: `http://127.0.0.1:${String(launch.proxyPort)}`, bypass: '<-loopback>' },
    args: [
      '--disable-quic',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      ...(launch.isHeadless
        ? []
        : [`--window-size=${viewport.width},${viewport.height}`, '--window-position=0,0']),
    ],
  });

  const state: BrowserState = {
    context,
    tabs: new Map(),
    counter: 0,
    isOpening: false,
    isDiskNew: !isUsed,
  };

  context.on('close', () => {
    state.tabs.clear();
  });

  await context.routeWebSocket('**/*', (socket) => socket.close({ code: 1008 }));

  await context.route('**/*', async (route) => {
    const request = route.request();

    try {
      if (request.isNavigationRequest()) {
        await launch.gate.scan(request.url());
      }

      const text = await readRequestText(request);

      await launch.gate.scanText(text);
    } catch {
      await route.abort('blockedbyclient');

      return;
    }

    await route.continue();
  });

  return state;
}

function readStringEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value]],
    ),
  );
}

async function readRequestText(request: Request): Promise<string> {
  const headers = await request.allHeaders();

  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);

  return `${lines.join('\n')}\n\n${request.postDataBuffer()?.toString('utf8') ?? ''}`;
}
