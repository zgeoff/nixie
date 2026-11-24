import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@zgeoff/testing';
import { mockComputerStream } from '../mocks/mock-computer-stream';
import { store } from '../mocks/store';
import { pasteIntoScreen } from '../test-utils/paste-into-screen';
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

  const takeOver = async (): Promise<void> => {
    const session = await store.sessions.create({});

    await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

    await view.navigate(`${app.url}/computer`);

    await waitForPage(
      view,
      "[...document.querySelectorAll('button:enabled')].some((button) => button.innerText === 'Take over')",
    );

    await view.click('main button');

    await waitForPage(view, "document.body.innerText.includes('You have taken over the computer')");
  };

  return { api, appURL: app.url, desktop, takeOver, view };
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

test('it starts no take-over on a refresh of the computer page after a take-over from the banner is handed back', async () => {
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

  await ctx.view.evaluate("document.querySelector('main button').click()");

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('reach the computer until you take over.')",
  );

  await ctx.view.reload();

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('reach the computer until you take over.')",
  );

  await waitForPage(
    ctx.view,
    "[...document.querySelectorAll('button:enabled')].some((button) => button.innerText === 'Take over')",
  );

  const text: unknown = await ctx.view.evaluate('document.querySelector("main").innerText');

  expect(text).not.toInclude('You have taken over the computer');
});

test('it sends text that the user pastes as key presses, with a Unicode keysym for a character outside Latin-1 and Return for a line break', async () => {
  const ctx = await setupTest();

  await ctx.takeOver();

  await pasteIntoScreen(ctx.view, 'né☃\n');

  await waitFor(() => {
    expect(ctx.desktop.received.keys).toHaveLength(8);
  });

  expect(ctx.desktop.received.keys).toStrictEqual([
    { keysym: 0x6e, isDown: true },
    { keysym: 0x6e, isDown: false },
    { keysym: 0xe9, isDown: true },
    { keysym: 0xe9, isDown: false },
    { keysym: 0x01_00_26_03, isDown: true },
    { keysym: 0x01_00_26_03, isDown: false },
    { keysym: 0xff_0d, isDown: true },
    { keysym: 0xff_0d, isDown: false },
  ]);
});

test('it sends each line break of a multi-line paste as one Return, so a terminal runs the lines as typed', async () => {
  const ctx = await setupTest();

  await ctx.takeOver();

  await pasteIntoScreen(ctx.view, 'ls\r\npwd\n');

  await waitFor(() => {
    expect(ctx.desktop.received.keys).toHaveLength(14);
  });

  expect(ctx.desktop.received.keys).toStrictEqual([
    { keysym: 0x6c, isDown: true },
    { keysym: 0x6c, isDown: false },
    { keysym: 0x73, isDown: true },
    { keysym: 0x73, isDown: false },
    { keysym: 0xff_0d, isDown: true },
    { keysym: 0xff_0d, isDown: false },
    { keysym: 0x70, isDown: true },
    { keysym: 0x70, isDown: false },
    { keysym: 0x77, isDown: true },
    { keysym: 0x77, isDown: false },
    { keysym: 0x64, isDown: true },
    { keysym: 0x64, isDown: false },
    { keysym: 0xff_0d, isDown: true },
    { keysym: 0xff_0d, isDown: false },
  ]);
});

test('it offers a button for copied text that the browser refuses to write', async () => {
  const ctx = await setupTest();

  // the app's origin has a port of its own in each test, so the refusal ends with the test
  await ctx.view.cdp('Browser.setPermission', {
    permission: { name: 'clipboard-write' },
    setting: 'denied',
    origin: ctx.appURL,
  });

  await ctx.takeOver();

  ctx.desktop.sendCutText('order 4471');

  await waitForPage(
    ctx.view,
    "[...document.querySelectorAll('button')].some((button) => button.innerText === 'Copy it')",
  );

  const text: unknown = await ctx.view.evaluate('document.querySelector("main").innerText');

  expect(text).toInclude('Your browser would not copy the text that the computer copied.');
});
