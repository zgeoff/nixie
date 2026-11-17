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

  return {
    setViewport: (width: number, height: number, mobile: boolean) =>
      view.cdp('Emulation.setDeviceMetricsOverride', {
        deviceScaleFactor: mobile ? 3 : 1,
        height,
        mobile,
        width,
      }),
    signIn: () => setupSignedInBrowser(view, { appURL: app.url, token: session.token }),
    view,
  };
}

test.each([
  [1280, 800, false],
  [390, 844, true],
] as const)(
  'it loads earlier messages after a burst of task closes fills the first page at %ix%i',
  async (width, height, isMobile) => {
    const ctx = await setupTest();

    for (let index = 0; index < 120; index += 1) {
      await store.records.create({
        kind: index % 2 === 0 ? 'owner_message' : 'model.reply',
        message: { text: `Older message ${index}` },
      });
    }

    await store.records.create({ kind: 'task.step_started', task: { taskID: 'closer' } });

    for (let index = 0; index < 34; index += 1) {
      const callID = `close-${index}`;

      await store.records.create({
        kind: 'tool_call',
        toolCall: { callID, input: { taskID: `t${index}` }, tool: 'task.close' },
      });

      await store.records.create({
        kind: 'tool_result',
        toolCall: { callID, content: { closed: true }, outcome: 'ok', tool: 'task.close' },
      });
    }

    await store.records.create({ kind: 'task.step_committed', task: { taskID: 'closer' } });
    await store.records.create({ kind: 'owner_message', message: { text: 'Newest question' } });
    await store.records.create({ kind: 'model.reply', message: { text: 'Newest answer' } });
    await ctx.setViewport(width, height, isMobile);
    await ctx.signIn();

    await waitFor(
      async () => {
        const text: unknown = await ctx.view.evaluate('document.body.innerText');

        expect(text).toInclude('Newest answer');
      },
      { timeout: 10_000 },
    );

    // Scrolling to the top asks for earlier history until the first message shows.
    await waitFor(
      async () => {
        const first = await runInPage(
          ctx.view,
          () => {
            const scroller = document.querySelector('ol[aria-label="Conversation"]')?.parentElement;

            if (scroller !== null && scroller !== undefined) {
              scroller.scrollTop = 0;
            }

            return document.querySelector('ol[aria-label="Conversation"] > li')?.textContent ?? '';
          },
          undefined,
          z.string(),
        );

        expect(first).toInclude('Older message 0');
      },
      { timeout: 6000 },
    );
  },
);

test.each([
  [1280, 800, false],
  [390, 844, true],
] as const)(
  'it wraps a long unbroken tool line inside the thread at %ix%i',
  async (width, height, isMobile) => {
    const ctx = await setupTest();

    for (let index = 0; index < 30; index += 1) {
      await store.records.create({ message: { text: `Message ${index}` } });
    }

    await store.records.create({ kind: 'task.step_started', task: { taskID: 'closer' } });

    await store.records.create({
      kind: 'tool_call',
      toolCall: {
        callID: 'long',
        input: { taskID: 'k3vq8m2xpa'.repeat(6) },
        tool: 'task.close',
      },
    });

    await store.records.create({ kind: 'task.step_committed', task: { taskID: 'closer' } });
    await ctx.setViewport(width, height, isMobile);
    await ctx.signIn();

    await waitFor(
      async () => {
        const text: unknown = await ctx.view.evaluate('document.body.innerText');

        expect(text).toInclude('task close');
      },
      { timeout: 10_000 },
    );

    const layout = await runInPage(
      ctx.view,
      () => {
        const list = document.querySelector('ol[aria-label="Conversation"]');
        const scroller = list?.parentElement;

        return {
          documentOverflowsX: document.documentElement.scrollWidth > innerWidth,
          documentOverflowsY: (document.scrollingElement?.scrollHeight ?? 0) > innerHeight,
          isScrolledSideways: (scroller?.scrollWidth ?? 0) > (scroller?.clientWidth ?? 0),
          isScrollable: (scroller?.scrollHeight ?? 0) > (scroller?.clientHeight ?? 0),
        };
      },
      undefined,
      z.object({
        documentOverflowsX: z.boolean(),
        documentOverflowsY: z.boolean(),
        isScrollable: z.boolean(),
        isScrolledSideways: z.boolean(),
      }),
    );

    expect(layout).toStrictEqual({
      documentOverflowsX: false,
      documentOverflowsY: false,
      isScrollable: true,
      isScrolledSideways: false,
    });
  },
);
