import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { runInPage } from '@zgeoff/rig';
import { z } from 'zod';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  // Hooks run in the order registered, so the viewport resets before the view closes.
  onTestFinished(async () => {
    await view.cdp('Emulation.clearDeviceMetricsOverride');
  });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({});

  const marksSchema = z.object({ marked: z.array(z.string()), path: z.string() });

  return {
    appURL: app.url,
    readDrawer: () =>
      runInPage(
        view,
        () => {
          const dialog = document.querySelector('dialog');
          const button = document.querySelector('button[aria-label="Menu"][aria-haspopup]');
          const barNav = document.querySelector('header > nav');

          return {
            activeIsInDialog: dialog?.contains(document.activeElement) ?? false,
            activeIsMenuButton: document.activeElement === button,
            isBarNavVisible: barNav !== null && barNav.getBoundingClientRect().width > 0,
            isMenuButtonEnabled: button?.matches(':enabled') ?? false,
            isMenuButtonVisible: button !== null && button.getBoundingClientRect().width > 0,
            isOpen: dialog?.open ?? false,
            width: innerWidth,
          };
        },
        undefined,
        z.object({
          activeIsInDialog: z.boolean(),
          activeIsMenuButton: z.boolean(),
          isBarNavVisible: z.boolean(),
          isMenuButtonEnabled: z.boolean(),
          isMenuButtonVisible: z.boolean(),
          isOpen: z.boolean(),
          width: z.number(),
        }),
      ),
    readMarks: () =>
      runInPage(
        view,
        () => {
          const links = document.querySelectorAll('header > nav a[aria-current="page"]');
          const marked = Array.from(links, (link) => link.textContent ?? '');

          return { marked, path: location.pathname };
        },
        undefined,
        marksSchema,
      ),
    setViewport: (width: number, height: number) =>
      view.cdp('Emulation.setDeviceMetricsOverride', {
        deviceScaleFactor: 1,
        height,
        mobile: false,
        width,
      }),
    signIn: () => setupSignedInBrowser(view, { appURL: app.url, token: session.token }),
    view,
  };
}

test('it marks the current page in the bar, and its parent on a detail page', async () => {
  const ctx = await setupTest();

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  const moment = await store.moments.create({ title: 'Kettle talk' });

  await ctx.setViewport(1280, 800);
  await ctx.signIn();

  const stops = [
    { label: 'Conversation', path: '/' },
    { label: 'Memory', path: '/memory' },
    { label: 'Proposals', path: '/proposals' },
    { label: 'Mandates', path: '/mandates' },
    { label: 'Moments', path: '/moments' },
    { label: 'Tasks', path: '/tasks' },
    { label: 'Passkeys', path: '/passkeys' },
  ];

  const reached: string[] = [];

  for (const stop of stops) {
    // The bar scrolls sideways, so a link past its right edge needs a scroll before a click lands.
    await runInPage(
      ctx.view,
      (href: string) => {
        document
          .querySelector(`header > nav a[href="${href}"]`)
          ?.scrollIntoView({ inline: 'center' });

        return true;
      },
      stop.path,
      z.boolean(),
    );

    await ctx.view.click(`header > nav a[href="${stop.path}"]`);

    await waitFor(
      async () => {
        const marks = await ctx.readMarks();

        expect(marks).toStrictEqual({ marked: [stop.label], path: stop.path });
      },
      { timeout: 10_000 },
    );

    reached.push(stop.label);
  }

  expect(reached).toStrictEqual([
    'Conversation',
    'Memory',
    'Proposals',
    'Mandates',
    'Moments',
    'Tasks',
    'Passkeys',
  ]);

  const details = [
    { label: 'Tasks', path: '/tasks/k3vq8m2xpa' },
    { label: 'Moments', path: `/moments/${moment.momentID}` },
  ];

  for (const detail of details) {
    await ctx.view.navigate(`${ctx.appURL}${detail.path}`);

    await waitFor(
      async () => {
        const marks = await ctx.readMarks();

        expect(marks).toStrictEqual({ marked: [detail.label], path: detail.path });
      },
      { timeout: 10_000 },
    );
  }
});

test('it folds the nav into a drawer at phone width that closes on a link, Escape or a tap outside', async () => {
  const ctx = await setupTest();

  await ctx.setViewport(390, 844);
  await ctx.signIn();

  // The Menu button stays disabled until hydration gives it a click handler.
  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer).toStrictEqual({
        activeIsInDialog: false,
        activeIsMenuButton: false,
        isBarNavVisible: false,
        isMenuButtonEnabled: true,
        isMenuButtonVisible: true,
        isOpen: false,
        width: 390,
      });
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('button[aria-haspopup="dialog"]');

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(true);
      expect(drawer.activeIsInDialog).toBe(true);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('dialog nav a[href="/memory"]');

  await waitFor(
    async () => {
      const marks = await ctx.readMarks();
      const drawer = await ctx.readDrawer();

      expect(marks).toStrictEqual({ marked: ['Memory'], path: '/memory' });
      expect(drawer.isOpen).toBe(false);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('button[aria-haspopup="dialog"]');

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(true);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('dialog nav a[href="/proposals"]');

  await waitFor(
    async () => {
      const marks = await ctx.readMarks();
      const drawer = await ctx.readDrawer();

      expect(marks).toStrictEqual({ marked: ['Proposals'], path: '/proposals' });
      expect(drawer.isOpen).toBe(false);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('button[aria-haspopup="dialog"]');

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(true);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('dialog nav a[href="/mandates"]');

  await waitFor(
    async () => {
      const marks = await ctx.readMarks();
      const drawer = await ctx.readDrawer();

      expect(marks).toStrictEqual({ marked: ['Mandates'], path: '/mandates' });
      expect(drawer.isOpen).toBe(false);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('button[aria-haspopup="dialog"]');

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(true);
    },
    { timeout: 10_000 },
  );

  await ctx.view.press('Escape');

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(false);
      expect(drawer.activeIsMenuButton).toBe(true);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('button[aria-haspopup="dialog"]');

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(true);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click(370, 600);

  await waitFor(
    async () => {
      const drawer = await ctx.readDrawer();

      expect(drawer.isOpen).toBe(false);
    },
    { timeout: 10_000 },
  );
});

test.each([
  { name: 'desktop', height: 800, width: 1280 },
  { name: 'phone', height: 844, width: 390 },
])('it keeps the composer in view below the bar on $name', async (row) => {
  const ctx = await setupTest();

  await Promise.all(
    Array.from({ length: 60 }, (_, index) =>
      store.records.create({ kind: 'owner_message', message: { text: `Message ${index}` } }),
    ),
  );

  await ctx.setViewport(row.width, row.height);
  await ctx.signIn();

  await waitFor(
    async () => {
      const read = await runInPage(
        ctx.view,
        () => {
          const box = document.querySelector('textarea')?.getBoundingClientRect();

          return {
            bottom: box?.bottom ?? Number.POSITIVE_INFINITY,
            height: innerHeight,
            scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
          };
        },
        undefined,
        z.object({ bottom: z.number(), height: z.number(), scrollHeight: z.number() }),
      );

      expect(read.bottom).toBeLessThanOrEqual(read.height);
      expect(read.scrollHeight).toBeLessThanOrEqual(read.height);
    },
    { timeout: 10_000 },
  );
});
