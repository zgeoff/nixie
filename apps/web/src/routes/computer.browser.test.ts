import { expect, onTestFinished, test } from 'bun:test';
import { mockComputerStream } from '../mocks/mock-computer-stream';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { startStubDesktop } from '../test-utils/start-stub-desktop';
import { waitForPage } from '../test-utils/wait-for-page';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });
  const desktop = startStubDesktop();

  mockComputerStream.url = desktop.url;

  onTestFinished(() => {
    mockComputerStream.url = null;
  });

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

test('it takes the computer over and hands it back with the buttons of the page', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/computer`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('reach the computer until you take over.')",
  );

  await waitForPage(
    ctx.view,
    "[...document.querySelectorAll('button:enabled')].some((button) => button.innerText === 'Take over')",
  );

  await ctx.view.click('main button');

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('You have taken over the computer')",
  );

  const whileHolding: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('main button')].map((button) => button.innerText)",
  );

  // view.click does not return while the viewer holds the keyboard, so the hand-back clicks in the page
  await ctx.view.evaluate("document.querySelector('main button').click()");

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('reach the computer until you take over.')",
  );

  const afterHandBack: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('main button')].map((button) => button.innerText)",
  );

  expect([whileHolding, afterHandBack]).toStrictEqual([['Hand back'], ['Take over']]);
});

test('it opens the computer watching, with no take-over, on a visit to a link that asks for one', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/computer?takeOver=true`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('reach the computer until you take over.')",
  );

  await waitForPage(
    ctx.view,
    "[...document.querySelectorAll('button:enabled')].some((button) => button.innerText === 'Take over')",
  );

  const text: unknown = await ctx.view.evaluate('document.body.innerText');

  expect(text).not.toInclude('You have taken over the computer');
});

test('it shows the handover banner for an ask, and clears it when the ask closes', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'itch.io asks for a CAPTCHA' },
  });

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('asks you to take over the computer: itch.io asks for a CAPTCHA')",
  );

  const shown: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('section button')].some((button) => button.innerText === 'Take over')",
  );

  await store.records.create({ kind: 'computer.handover_closed' });

  await waitForPage(
    ctx.view,
    "!document.body.innerText.includes('asks you to take over the computer')",
  );

  expect(shown).toBeTrue();
});

test('it takes over from the handover banner and clears the banner once the take-over starts', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await store.records.create({
    kind: 'computer.handover_asked',
    message: { text: 'itch.io asks for a CAPTCHA' },
  });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitForPage(ctx.view, "document.body.innerText.includes('asks you to take over')");

  await ctx.view.evaluate(
    "[...document.querySelectorAll('section button')].find((button) => button.innerText === 'Take over').click()",
  );

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('You have taken over the computer')",
  );

  await store.records.create({ kind: 'computer.takeover_started' });

  await waitForPage(
    ctx.view,
    "!document.body.innerText.includes('asks you to take over the computer')",
  );

  const text: unknown = await ctx.view.evaluate('document.body.innerText');

  expect(text).toInclude('You have taken over the computer');
});
