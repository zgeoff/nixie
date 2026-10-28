import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { z } from 'zod';
import { store } from '../mocks/store';
import { checkBrowserSkip } from '../test-utils/check-browser-skip';
import { createBrowserView } from '../test-utils/create-browser-view';
import { runInPage } from '../test-utils/run-in-page';
import { setBrowserFiles } from '../test-utils/set-browser-files';
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

  const answerRequest = () =>
    new Response(`<a id="open" href="${app.url}/">Open nixie</a>`, {
      headers: { 'content-type': 'text/html' },
    });

  // localhost is another site than 127.0.0.1, so a link from this page into the app is a
  // navigation from outside the site, as a launch from the home-screen icon is.
  const elsewhere = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await elsewhere.stop(true);
  });

  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { api, appURL: app.url, elsewhereURL: `http://localhost:${elsewhere.port}/`, view };
}

test.skipIf(browserSkip.isSkipped)(
  'it renders the conversation signed in when a link from another site opens the app',
  async () => {
    const ctx = await setupTest();

    const [code] = await Promise.all([
      store.enrolmentCodes.create({}),
      store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
    ]);

    await ctx.view.navigate(`${ctx.appURL}/`);

    await runInPage(
      ctx.view,
      async (enrolmentCode: string) => {
        const response = await fetch('/rpc/sessions/enrol', {
          body: JSON.stringify({
            json: {
              clientActionID: '0b7e4f2a-6c1d-4e8b-9a3f-5d2c8e1b7a64',
              code: enrolmentCode,
              deviceName: 'kitchen tablet',
              tokenDelivery: 'cookie',
            },
          }),
          headers: { 'content-type': 'application/json', 'x-nixie-client': 'web' },
          method: 'POST',
        });

        return response.status;
      },
      code.code,
      z.number(),
    );

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

    expect(ctx.api.requests.filter((request) => request.authorization !== null)).toStrictEqual([
      { authorization: `Bearer ${session?.token}`, cookie: null, path: '/rpc/conversation/read' },
    ]);
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it checks again in the browser when the server render gets no cookie that the browser holds',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });

    // A browser leaves a Strict cookie off a navigation from another site, so the server renders
    // the page without the session that the browser holds.
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
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it sends a photo picked in the browser with the message, then shows it in the thread',
  async () => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

    await setBrowserFiles(ctx.view, {
      selector: 'input[type=file][multiple]',
      files: [
        {
          name: 'swatch.png',
          bytes: Uint8Array.fromBase64(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
          ),
        },
      ],
    });

    await waitFor(
      async () => {
        const attached: unknown = await ctx.view.evaluate(
          'document.querySelector(\'img[alt="Attached image 1"]\') !== null',
        );

        expect(attached).toBeTrue();
      },
      { timeout: 10_000 },
    );

    await ctx.view.click('textarea');
    await ctx.view.cdp('Input.insertText', { text: 'Is this the right shade?' });
    await ctx.view.click('button[type=submit]');

    await waitFor(
      async () => {
        const width: unknown = await ctx.view.evaluate(
          "document.querySelector('[role=status]') === null ? (document.querySelector('img[alt=\"Image 1\"]')?.naturalWidth ?? 0) : 0",
        );

        expect(width).toBe(1);
      },
      { timeout: 10_000 },
    );

    expect(
      store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message,
    ).toMatchObject({
      images: [{ data: expect.toBeString(), mediaType: 'image/png' }],
      text: 'Is this the right shade?',
    });
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it shows the enrolment form once the browser finds that it holds no session',
  async () => {
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
  },
);
