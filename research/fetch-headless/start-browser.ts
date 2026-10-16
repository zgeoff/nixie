import { existsSync } from 'node:fs';
import type { Browser } from 'playwright-core';
import { chromium } from 'playwright-core';

// plain: headless Chromium as Playwright starts it, which names itself HeadlessChrome.
// masked: the same browser with a desktop Chrome user agent and without the automation flags.
export type BrowserVariant = 'plain' | 'masked';

// Every flag that matters for egress. The proxy is the only route out: QUIC and WebRTC UDP never
// go through an HTTP proxy, so both are off, and the resolver rules answer every name with
// NOTFOUND, so a request that skipped the proxy could not even resolve its host.
const egressFlags = [
  '--disable-quic',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  '--dns-prefetch-disable',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--disable-sync',
  '--no-pings',
  '--no-service-autorun',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-features=OptimizationHints,MediaRouter,DialMediaRouteProvider,Translate,AutofillServerCommunication,CertificateTransparencyComponentUpdater,SafeBrowsing',
];

// Debian's Chromium build number, as a desktop Chrome on Linux sends it
const maskedUserAgent =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';

export interface BrowserOptions {
  readonly variant: BrowserVariant;

  // the checking proxy's port on loopback, or null to start with no proxy at all
  readonly proxyPort: number | null;
}

// the engine the image holds: the full browser, else the headless-only build
export const engine = existsSync('/usr/bin/chromium') ? 'full' : 'shell';

export async function startBrowser(options: BrowserOptions): Promise<Browser> {
  const masked = options.variant === 'masked';

  return chromium.launch({
    executablePath: engine === 'full' ? '/usr/bin/chromium' : '/usr/bin/chromium-headless-shell',
    headless: true,
    // Chromium's own sandbox fails to start under Docker's default profile
    chromiumSandbox: false,
    ...(options.proxyPort === null
      ? {}
      : { proxy: { server: `http://127.0.0.1:${options.proxyPort}`, bypass: '<-loopback>' } }),
    args: [
      ...egressFlags,
      '--disable-dev-shm-usage',
      '--disable-gpu',
      ...(masked ? ['--disable-blink-features=AutomationControlled'] : []),
    ],
    ...(masked ? { ignoreDefaultArgs: ['--enable-automation'] } : {}),
  });
}

export function getUserAgent(variant: BrowserVariant): string | undefined {
  return variant === 'masked' ? maskedUserAgent : undefined;
}
