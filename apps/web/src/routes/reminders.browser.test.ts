import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { mockViewStore } from '../mocks/mock-view-store';
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

  return { appURL: app.url, view };
}

test('it lists a reminder with its note, its trigger in words and its next fire, and cancels it', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await mockViewStore.reminders.create({
    name: 'Tomatoes',
    next: '2027-03-12T08:00:00.000Z',
    note: 'Water the tomatoes.',
    reminder: 'r7q2x9k4pa',
    rendered: 'every Friday at 08:00',
    trigger: {
      schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
    },
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/reminders`);

  const row = 'li[aria-label="Tomatoes"]';

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate(
        `document.querySelector('${row}')?.innerText ?? ''`,
      );

      expect(text).toInclude('Water the tomatoes.');
      expect(text).toInclude('every Friday at 08:00 · next:');
    },
    { timeout: 10_000 },
  );

  await ctx.view.evaluate(
    `document.querySelector('${row} button[name="cancel-reminder"]').click()`,
  );

  await waitFor(
    async () => {
      const found: unknown = await ctx.view.evaluate(`document.querySelector('${row}') === null`);

      expect(found).toBeTrue();
    },
    { timeout: 10_000 },
  );
});
