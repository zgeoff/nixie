import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

// These tests open the built web client in a headless Chrome or Chromium, which Bun finds on PATH,
// in a standard install location, or at BUN_CHROME_PATH.
async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  // localhost is another site than 127.0.0.1, so following this page's link into the app is a
  // navigation from outside the site, as a launch from the home-screen icon is
  const elsewhere = Bun.serve({
    fetch: () =>
      new Response(`<a id="open" href="${app.url}/">Open nixie</a>`, {
        headers: { 'content-type': 'text/html' },
      }),
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await elsewhere.stop(true);
  });

  // Chrome's sandbox needs user namespaces that a container or a root user lacks, and the browser
  // loads only pages from the loopback servers this test starts
  const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one; the first navigation opens the view's DevTools session
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { api, appURL: app.url, elsewhereURL: `http://localhost:${elsewhere.port}/`, view };
}

test('it renders the conversation signed in when a link from another site opens the app', async () => {
  const ctx = await setupTest();

  const [code] = await Promise.all([
    store.enrolmentCodes.create({}),
    store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
  ]);

  // the browser enrols on the app's origin and keeps the cookie that the enrolment response sets
  await ctx.view.navigate(`${ctx.appURL}/`);

  await ctx.view.evaluate(`fetch('/rpc/sessions/enrol', {
    body: JSON.stringify({ json: { clientActionID: '0b7e4f2a-6c1d-4e8b-9a3f-5d2c8e1b7a64', code: '${code.code}', deviceName: 'kitchen tablet', tokenDelivery: 'cookie' } }),
    headers: { 'content-type': 'application/json', 'x-nixie-client': 'web' },
    method: 'POST',
  }).then((response) => response.status)`);

  await ctx.view.navigate(ctx.elsewhereURL);
  await ctx.view.click('#open');

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Is the kettle on?');
    },
    { timeout: 10_000 },
  );

  const session = store.sessions.findFirst((query) =>
    query.where({ deviceName: 'kitchen tablet' }),
  );

  // only a server render sends a bearer token, and only the launch's render had a session to
  // forward, so this holds whatever order the earlier page's calls arrive in
  expect(ctx.api.requests.filter((request) => request.authorization !== null)).toStrictEqual([
    { authorization: `Bearer ${session?.token}`, cookie: null, path: '/rpc/conversation/read' },
  ]);
}, 120_000);

test('it checks again in the browser when the server render gets no cookie that the browser holds', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });

  // a browser leaves a Strict cookie off a navigation from another site, so the server renders
  // the page without the session that the browser holds
  await ctx.view.navigate(ctx.elsewhereURL);

  await ctx.view.cdp('Network.setCookie', {
    httpOnly: true,
    name: 'nixie_session',
    path: '/',
    sameSite: 'Strict',
    secure: true,
    url: `${ctx.appURL}/`,
    value: session.token,
  });

  await ctx.view.click('#open');

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Is the kettle on?');
    },
    { timeout: 10_000 },
  );

  expect(ctx.api.requests.slice(0, 2)).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/conversation/read' },
    {
      authorization: null,
      cookie: `nixie_session=${session.token}`,
      path: '/rpc/conversation/read',
    },
  ]);
}, 120_000);

test('it shows the enrolment form once the browser finds that it holds no session', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(ctx.elsewhereURL);
  await ctx.view.click('#open');

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Enrol this browser');
    },
    { timeout: 10_000 },
  );

  expect(ctx.api.requests).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/conversation/read' },
    { authorization: null, cookie: null, path: '/rpc/conversation/read' },
  ]);
}, 120_000);
