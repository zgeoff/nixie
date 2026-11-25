import { expect, onTestFinished, test } from 'bun:test';
import { connectionStore } from '../mocks/connection-store';
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

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({});

  await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

  const waitOnPage = (expression: string) => waitForPage(view, expression, 8000);

  return {
    appURL: app.url,
    view,
    waitForPage: waitOnPage,
    readText: async (): Promise<string> => {
      const text: unknown = await view.evaluate('document.body.innerText');

      return String(text);
    },
    registerClient: async (): Promise<void> => {
      await view.navigate(`${app.url}/settings/connections`);

      await waitOnPage(
        'document.querySelector(\'form[aria-label="Register the OAuth client"] fieldset\')?.disabled === false',
      );

      // a click on a control below the fold hangs, so the page scrolls to the form first
      await view.evaluate(
        `document.querySelector('form[aria-label="Register the OAuth client"]').scrollIntoView()`,
      );

      await view.click('form[aria-label="Register the OAuth client"] label:nth-of-type(1) input');
      await view.type('client-123.apps.test');
      await view.click('form[aria-label="Register the OAuth client"] label:nth-of-type(2) input');
      await view.type('secret-value-123');
      await view.click('form[aria-label="Register the OAuth client"] button[type=submit]');

      await waitOnPage(
        'document.querySelector(\'section[aria-label="Registered OAuth client"]\') !== null',
      );
    },
    connect: async (): Promise<void> => {
      await waitOnPage(
        "[...document.querySelectorAll('button')].some((button) => button.innerText === 'Connect a Google account' && !button.disabled)",
      );

      await view.evaluate(
        "[...document.querySelectorAll('button')].find((button) => button.innerText === 'Connect a Google account').click()",
      );

      await waitOnPage("location.pathname.startsWith('/settings/connections/')");
    },
  };
}

test('it registers a client and connects through the return route to the connection page', async () => {
  const ctx = await setupTest();

  await ctx.registerClient();

  const text = await ctx.readText();

  await ctx.connect();
  await ctx.waitForPage("document.body.innerText.includes('Active')");

  const afterText = await ctx.readText();

  expect([
    text.includes('secret-value-123'),
    afterText.includes('mock-code'),
    connectionStore.connections.all().map((connection) => connection.status),
  ]).toStrictEqual([false, false, ['active']]);
});

test('it shows the missing scopes on the connection page and in the list, and never in the conversation', async () => {
  const ctx = await setupTest();

  connectionStore.answers.grantedScopes = ['calendar.events', 'drive.file'];

  await ctx.registerClient();
  await ctx.connect();

  await ctx.waitForPage(
    'document.querySelector(\'section[aria-label="Missing scopes"]\') !== null',
  );

  const page = await ctx.readText();

  await ctx.view.navigate(`${ctx.appURL}/settings/connections`);
  await ctx.waitForPage("document.body.innerText.includes('Missing scopes: gmail.modify')");
  await ctx.view.navigate(`${ctx.appURL}/`);
  await ctx.waitForPage("document.querySelector('textarea, input') !== null");

  const conversation = await ctx.readText();

  expect([
    page.includes('gmail.modify: Google did not grant it. This holds back every gmail tool.'),
    page.includes('calendar.calendarlist.readonly: Google did not grant it.'),
    conversation.includes('gmail.modify'),
  ]).toStrictEqual([true, true, false]);
});

test('it forgets a connection and shows the erasure, the revocation and the key backups apart', async () => {
  const ctx = await setupTest();

  connectionStore.answers.forget = {
    erasure: 'done',
    revocation: 'confirmed',
    backup: { state: 'pending' },
  };

  await connectionStore.connections.create({ label: 'Work', account: 'work@example.test' });

  const connection = connectionStore.connections.all()[0]?.connection ?? '';

  await ctx.view.navigate(`${ctx.appURL}/settings/connections/${connection}`);

  await ctx.waitForPage(
    "[...document.querySelectorAll('button')].some((button) => button.innerText === 'Forget this connection' && !button.disabled)",
  );

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.innerText === 'Forget this connection').click()",
  );

  await ctx.waitForPage(
    "[...document.querySelectorAll('button')].some((button) => button.innerText === 'Forget for good')",
  );

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.innerText === 'Forget for good').click()",
  );

  await ctx.waitForPage('document.querySelector(\'section[aria-label="Forget status"]\') !== null');

  const statusText = await ctx.readText();

  const lines = statusText.split('\n');

  expect([
    lines.some((line) => line.startsWith('Erasure: done')),
    lines.some((line) => line.startsWith('Revocation: confirmed')),
    lines.some((line) => line.startsWith('Key backups: pending')),
  ]).toStrictEqual([true, true, true]);
});
