import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { ScanGate } from './make-scan-gate';
import { viewport } from './shoot-tab';
import type { BrowserState } from './types';

export interface BrowserLaunch {
  readonly home: string;
  readonly proxyPort: number;
  readonly gate: ScanGate;
  readonly executablePath?: string;
}

// Starts Chromium on the profile in the home folder. Every connection goes to the checking proxy,
// QUIC and WebRTC are off so nothing leaves past it, and each navigation asks the server to scan
// its URL before it goes.
export async function launchBrowser(launch: BrowserLaunch): Promise<BrowserState> {
  const profile = join(launch.home, 'profile');
  const marker = join(launch.home, '.nixie-disk-used');

  await mkdir(profile, { recursive: true });

  const isUsed = await stat(marker).then(
    () => true,
    () => false,
  );

  await writeFile(marker, '');

  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport,
    ...(launch.executablePath === undefined ? {} : { executablePath: launch.executablePath }),
    acceptDownloads: true,
    proxy: { server: `http://127.0.0.1:${String(launch.proxyPort)}`, bypass: '<-loopback>' },
    args: [
      '--disable-quic',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  });

  const state: BrowserState = { context, tabs: new Map(), counter: 0, isDiskNew: !isUsed };

  context.on('close', () => {
    state.tabs.clear();
  });

  await context.route('**/*', async (route) => {
    const request = route.request();

    if (request.isNavigationRequest()) {
      try {
        await launch.gate.scan(request.url());
      } catch {
        await route.abort('blockedbyclient');

        return;
      }
    }

    await route.continue();
  });

  return state;
}
