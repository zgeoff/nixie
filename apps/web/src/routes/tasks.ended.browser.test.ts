import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { mockViewStore } from '../mocks/mock-view-store';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

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

  return { appURL: app.url, view };
}

test('it opens the thread of the task of an ended run from the list', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });
  await mockViewStore.endedRuns.create({ cause: 'finished', taskID: 'k3vq8m2xpa' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/ended`);

  // The trigger report's line lands after the link and moves it down, so a click sent before it
  // lands can miss the link.
  await waitForPage(
    ctx.view,
    `document.querySelector('a[href="/tasks/k3vq8m2xpa"]') !== null && document.body.innerText.includes('No late or skipped fires since')`,
  );

  await ctx.view.click('a[href="/tasks/k3vq8m2xpa"]');

  await waitForPage(ctx.view, `location.pathname === '/tasks/k3vq8m2xpa'`);
});

test('it shows a skipped fire in the trigger report with no reload when its record arrives', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/ended`);

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('No late or skipped fires since');
    },
    { timeout: 10_000 },
  );

  await mockViewStore.reportEntries.create({
    definitionID: 'water-the-tomatoes',
    kind: 'skipped',
    name: 'Water the tomatoes',
    reason: 'task_held',
    scheduledFor: new Date().toISOString(),
  });

  // The page starts to follow the log a moment after it reads the report, so a record that lands
  // before then goes unseen. Each try adds another record until the stream is up.
  await waitFor(
    async () => {
      await store.records.create({ kind: 'trigger.skipped', thread: 'k3vq8m2xpa' });

      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Water the tomatoes: skipped, because its task was held');
    },
    { timeout: 10_000 },
  );
});
