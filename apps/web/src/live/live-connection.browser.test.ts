import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { mockLive } from '../mocks/mock-live';
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

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { api, appURL: app.url, view };
}

test('it holds one stream on a thread page, and overlaps two while it switches to a page with no thread', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitFor(
    () => {
      expect(mockLive.openedThreads).toContain('conversation');
      expect(mockLive.openCount).toBe(1);
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('a[href="/tasks"]');

  await waitFor(
    () => {
      expect(mockLive.openedThreads.at(-1)).toBeUndefined();
      expect(mockLive.openCount).toBe(1);
    },
    { timeout: 10_000 },
  );

  expect(mockLive.peakOpenCount).toBeGreaterThanOrEqual(2);
});

test('it opens no stream for topics alone while a page of another thread reads, and overlaps two while it switches', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });
  await store.tasks.create({ name: 'Seed order', taskID: 'p7hd2wq9zn' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

  await waitFor(
    () => {
      expect(mockLive.openedThreads.at(-1)).toBe('k3vq8m2xpa');
      expect(mockLive.openCount).toBe(1);
    },
    { timeout: 10_000 },
  );

  // The new thread's read takes long enough that a stream for topics alone would open meanwhile.
  ctx.api.delayPath('/rpc/conversation/read', 500);

  const openedBefore = mockLive.openedThreads.length;

  // a step of the router within the page, with no page between the two threads
  await ctx.view.evaluate(
    "(() => { history.pushState(null, '', '/tasks/p7hd2wq9zn'); dispatchEvent(new PopStateEvent('popstate')); })()",
  );

  await waitFor(
    () => {
      expect([mockLive.openCount, mockLive.openedThreads.slice(openedBefore)]).toStrictEqual([
        1,
        ['p7hd2wq9zn'],
      ]);
    },
    { timeout: 10_000 },
  );

  expect(mockLive.peakOpenCount).toBeGreaterThanOrEqual(2);
});
