import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { checkBrowserSkip } from '../test-utils/check-browser-skip';
import { createBrowserView } from '../test-utils/create-browser-view';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

// Bun 1.4.2's skipIf takes a boolean and has no in-body skip, so the suite checks the browser
// before its tests start.
const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });
  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { appURL: app.url, view };
}

test.skipIf(browserSkip.isSkipped)(
  'it sends a message written on a task page to that task, not the conversation',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

    await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

    await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

    await waitFor(
      async () => {
        const hasComposer: unknown = await ctx.view.evaluate(
          "document.querySelector('textarea') !== null",
        );

        expect(hasComposer).toBeTrue();
      },
      { timeout: 10_000 },
    );

    await ctx.view.click('textarea');
    await ctx.view.cdp('Input.insertText', { text: 'Put the beans in the north bed.' });
    await ctx.view.click('button[type=submit]');

    await waitFor(
      () => {
        expect(
          store.records.findFirst((query) => query.where({ kind: 'owner_message' })),
        ).toMatchObject({
          message: { text: 'Put the beans in the north bed.' },
          thread: 'k3vq8m2xpa',
        });
      },
      { timeout: 10_000 },
    );
  },
);
