import { expect, onTestFinished, test } from 'bun:test';
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

  const session = await store.sessions.create({ deviceName: 'laptop' });

  await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

  const waitInView = (expression: string) => waitForPage(view, expression, 8000);

  return {
    api,
    appURL: app.url,
    view,
    waitForPage: waitInView,
    openPage: async () => {
      await view.navigate(`${app.url}/mandates`);

      await waitInView(`document.querySelector('form[aria-label="Propose a mandate"]') !== null`);
    },
  };
}

test('it lists a mandate in force with its rule and ends it with End now', async () => {
  const ctx = await setupTest();

  await store.mandates.create({
    expires: new Date(Date.now() + 60 * 60 * 1000),
    rules: [{ ruleID: 'abc-1', sentence: 'Allow calendar.respond.' }],
    title: 'Full authority over my calendar invites',
  });

  await ctx.openPage();
  await ctx.waitForPage(`document.body.innerText.includes('Allow calendar.respond.')`);
  await ctx.view.click('button[name="end-now"]');
  await ctx.waitForPage(`document.body.innerText.includes('No mandate is in force.')`);

  expect(store.mandates.all()).toStrictEqual([]);
});

test('it proposes a mandate that then waits on the approvals page', async () => {
  const ctx = await setupTest();

  await ctx.openPage();

  // The list's arrival moves the form down, and a click lands where the field was
  await ctx.waitForPage(`document.body.innerText.includes('No mandate is in force.')`);
  await ctx.view.click('input[maxlength="120"]');
  await ctx.view.type('Handle my test sends');
  await ctx.view.click('div[aria-label="Rule 1"] textarea');
  await ctx.view.type('test.send');
  await ctx.view.evaluate(`document.querySelector('button[name="propose"]').click()`);
  await ctx.waitForPage(`document.querySelector('p[role="status"]') !== null`);

  const rows = store.approvalRows.all();

  expect(rows.map((row) => [row.cause, row.state])).toStrictEqual([['mandate', 'pending']]);

  // A real click lands on a point in the viewport, and the status line renders below the viewport
  await ctx.view.evaluate(`document.querySelector('p[role="status"] a').scrollIntoView()`);
  await ctx.view.click('p[role="status"] a');

  await ctx.waitForPage(
    `location.pathname === '/proposals' && document.querySelector('li[aria-label="Allow mail.send, as a stand-in."]') !== null`,
  );
});

test('it names the limit and the latest end when the end is beyond the longest mandate', async () => {
  const ctx = await setupTest();

  await ctx.openPage();
  await ctx.waitForPage(`document.body.innerText.includes('No mandate is in force.')`);
  await ctx.view.click('input[maxlength="120"]');
  await ctx.view.type('Handle my test sends');
  await ctx.view.click('div[aria-label="Rule 1"] textarea');
  await ctx.view.type('test.send');

  // React tracks the input's value, so a bare assignment would leave the form's state unchanged
  await ctx.view.evaluate(`(() => {
    const input = document.querySelector('input[type="datetime-local"]');
    const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60000);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, end.toISOString().slice(0, 16));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  await ctx.view.evaluate(`document.querySelector('button[name="propose"]').click()`);

  await ctx.waitForPage(
    `document.querySelector('ul[role="alert"]')?.innerText.includes('A mandate lasts at most 24 hours. The latest end you can ask for is') === true`,
  );

  expect(store.approvalRows.all()).toStrictEqual([]);
});

test.each([
  ['an empty list', 0, `document.body.innerText.includes('No mandate is in force.')`],
  [
    '2 mandates',
    2,
    `document.querySelectorAll('ul[aria-label="Mandates in force"] > li').length === 2`,
  ],
])(
  'it keeps the Propose a mandate form where it is when the list loads, with %s',
  async (_name, mandateCount, loaded) => {
    const ctx = await setupTest();

    const readTop = () =>
      ctx.view.evaluate(
        `document.querySelector('form[aria-label="Propose a mandate"] input[maxlength="120"]').getBoundingClientRect().top`,
      );

    await Promise.all(
      Array.from({ length: mandateCount }, (_item, index) =>
        store.mandates.create({
          expires: new Date(Date.now() + 60 * 60 * 1000),
          rules: [{ ruleID: `abc-${index + 1}`, sentence: `Allow calendar.respond.${index + 1}` }],
          title: `Calendar invites ${index + 1}`,
        }),
      ),
    );

    // The page paints before a read that takes this long, so it shows where the form sits without
    // the list.
    ctx.api.delayPath('/rpc/rules/listMandates', 500);

    await ctx.view.navigate(`${ctx.appURL}/mandates`);

    await ctx.waitForPage(
      `document.querySelector('form[aria-label="Propose a mandate"]') !== null`,
    );

    const before = await readTop();

    await ctx.waitForPage(loaded);

    const after = await readTop();

    expect(after).toBe(before);
  },
);
