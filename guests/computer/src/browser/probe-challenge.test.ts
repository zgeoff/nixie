import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerRequest } from '@heynixie/wire';
import { chromium } from 'playwright-core';
import { makeStubDriver } from '../screen/make-stub-driver';
import { makeBrowserHandler } from './make-browser-handler';
import { isChallengeFrameURL } from './probe-challenge';
import type { BrowserState } from './types';

const hasChromium = await chromium.launch({ headless: true }).then(
  async (browser) => {
    await browser.close();

    return true;
  },
  () => false,
);

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'challenge-'));

  const html = { headers: { 'Content-Type': 'text/html' } };

  const answerRequest = (request: Request): Response => {
    const url = new URL(request.url);

    const port = url.port;

    const framePage = (source: string) =>
      new Response(
        `<html><title>Gate</title><body>Gate<iframe src="${source}"></iframe></body></html>`,
        html,
      );

    return (
      new Map<string, Response>([
        ['/plain', new Response('<html><title>Plain</title><body>just a page</body></html>', html)],
        [
          '/recaptcha-frame',
          framePage(`http://www.google.com:${port}/recaptcha/api2/anchor?k=site`),
        ],
        [
          '/hcaptcha-widget',
          new Response(
            '<html><body><div class="h-captcha" data-sitekey="k"></div></body></html>',
            html,
          ),
        ],
        ['/hcaptcha-frame', framePage(`http://newassets.hcaptcha.com:${port}/captcha/v1/frame`)],
        [
          '/recaptcha-widget',
          new Response(
            '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>',
            html,
          ),
        ],
        [
          '/turnstile-widget',
          new Response('<html><body><div class="cf-turnstile"></div></body></html>', html),
        ],
        [
          '/interstitial',
          new Response(
            '<html><body><form id="challenge-form" action="/?__cf_chl_f_tk=abc" method="POST"></form></body></html>',
            html,
          ),
        ],
        [
          '/ordinary-form',
          new Response(
            '<html><body><form id="challenge-form" action="/submit"><input name="answer"></form></body></html>',
            html,
          ),
        ],
        [
          '/own-frame-widget',
          new Response(
            `<html><body>Gate<iframe src="http://pages.test:${
              port
            }/widget-inside"></iframe></body></html>`,
            html,
          ),
        ],
        [
          '/widget-inside',
          new Response(
            '<html><body><div class="g-recaptcha" data-sitekey="k"></div></body></html>',
            html,
          ),
        ],
        ['/arkose-frame', framePage(`http://client-api.arkoselabs.com:${port}/fc/gc/`)],
        [
          '/words-only',
          new Response(
            '<html><body>Please complete the CAPTCHA to verify you are human. recaptcha hcaptcha turnstile</body></html>',
            html,
          ),
        ],
        ['/recaptcha/api2/anchor', new Response('<html><body>anchor</body></html>', html)],
        ['/captcha/v1/frame', new Response('<html><body>frame</body></html>', html)],
        ['/fc/gc/', new Response('<html><body>arkose</body></html>', html)],
      ]).get(url.pathname) ?? new Response('not found', { status: 404 })
    );
  };

  const site = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: answerRequest });
  const views: BrowserState[] = [];

  const handle = makeBrowserHandler({
    home,
    deniedRanges: [],
    timeZone: 'UTC',
    isHeadless: true,
    gate: { scan: () => Promise.resolve(), scanText: () => Promise.resolve() },
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    screen: {
      makeDriver: (state) => {
        views.push(state);

        return makeStubDriver(state.tabs);
      },
      settleMs: 50,
    },
  });

  onTestFinished(async () => {
    await site.stop(true);

    await rm(home, { recursive: true, force: true });
  });

  const send = (request: ComputerRequest) =>
    handle(
      request,
      () => Promise.resolve(),
      () => Promise.resolve(),
    );

  return {
    send,

    // brings a tab to the front of the browser, as a person's switch to it does
    switchTo: async (tab: string) => {
      await views[0]?.tabs.get(tab)?.page.bringToFront();
    },
    open: (path: string) =>
      send({
        op: 'open',
        url: `http://pages.test:${String(site.port)}${path}`,
        limits: {
          bodyBytes: 1_000_000,
          timeoutMs: 20_000,
          redirects: 5,
          textBytes: 20_000,
          imageBytes: 0,
        },
        deniedRanges: [],
      }),
  };
}

test.each([
  ['https://www.google.com/recaptcha/api2/anchor?k=1', true],
  ['https://www.recaptcha.net/recaptcha/enterprise/anchor', true],
  ['https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html', true],
  ['https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile', true],
  ['https://client-api.arkoselabs.com/fc/gc/', true],
  ['https://www.google.com/maps/embed', false],
  ['https://example.com/recaptcha/api2/anchor', false],
  ['https://notgoogle.com/recaptcha/', false],
  ['about:blank', false],
  ['not a url', false],
])('it reads the frame address %s as a challenge: %p', (address, expected) => {
  expect(isChallengeFrameURL(address)).toBe(expected);
});

test.skipIf(!hasChromium)('it finds no challenge on a plain page', async () => {
  const ctx = await setupTest();
  const reply = await ctx.open('/plain');

  expect(reply).toMatchObject({ kind: 'page', hasChallenge: false });
});

test.skipIf(!hasChromium)(
  'it finds no challenge in an ordinary form that is named like one',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.open('/ordinary-form');

    expect(reply).toMatchObject({ kind: 'page', hasChallenge: false });
  },
);

test.skipIf(!hasChromium)('it finds no challenge in words that only talk about one', async () => {
  const ctx = await setupTest();
  const reply = await ctx.open('/words-only');

  expect(reply).toMatchObject({ kind: 'page', hasChallenge: false });
});

test.skipIf(!hasChromium).each([
  ['/recaptcha-frame', 'a reCAPTCHA frame'],
  ['/recaptcha-widget', 'a reCAPTCHA widget'],
  ['/hcaptcha-frame', 'an hCaptcha frame'],
  ['/hcaptcha-widget', 'an hCaptcha widget'],
  ['/turnstile-widget', 'a Turnstile widget'],
  ['/interstitial', 'the Cloudflare interstitial'],
  ['/arkose-frame', 'an Arkose frame'],
  ['/own-frame-widget', 'a widget in a frame of the site'],
])('it finds the challenge of %s (%s) on open, read and screenshot', async (path) => {
  const ctx = await setupTest();
  const opened = await ctx.open(path);
  const read = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });
  const shot = await ctx.send({ op: 'screenshot', tab: 't1' });

  expect([opened, read, shot]).toMatchObject([
    { kind: 'page', hasChallenge: true },
    { kind: 'page', hasChallenge: true },
    { kind: 'screenshot', hasChallenge: true },
  ]);
});

test.skipIf(!hasChromium)(
  'it checks the tab it is asked about, not the one opened last',
  async () => {
    const ctx = await setupTest();

    await ctx.open('/plain');
    await ctx.open('/recaptcha-frame');

    const first = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });
    const second = await ctx.send({ op: 'read', tab: 't2', mode: 'text' });
    const shotOfFirst = await ctx.send({ op: 'screenshot', tab: 't1' });

    expect([first, second, shotOfFirst]).toMatchObject([
      { hasChallenge: false },
      { hasChallenge: true },
      { hasChallenge: false },
    ]);
  },
);

test.skipIf(!hasChromium)(
  'it finds the challenge of a tab it switches back to, on read and screenshot',
  async () => {
    const ctx = await setupTest();

    await ctx.open('/recaptcha-frame');
    await ctx.open('/plain');

    // the screen tools build the driver, and with it the view of the browser, on their first call
    const plain = await ctx.send({ op: 'screenshot', tab: 't2' });

    await ctx.send({ op: 'desktopShot' });
    await ctx.switchTo('t1');

    const read = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });
    const shot = await ctx.send({ op: 'screenshot', tab: 't1' });

    expect([plain, read, shot]).toMatchObject([
      { kind: 'screenshot', hasChallenge: false },
      { kind: 'page', hasChallenge: true },
      { kind: 'screenshot', hasChallenge: true },
    ]);
  },
);
