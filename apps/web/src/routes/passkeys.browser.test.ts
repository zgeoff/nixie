import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { mockPasskeyCode } from '../mocks/passkey-rows';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

async function setupTest() {
  const authenticatorSchema = z.object({ authenticatorId: z.string() });
  const credentialsSchema = z.object({ credentials: z.array(z.unknown()) });
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const proxy = startFrontProxy({ apiURL: api.url, webURL: web.url });

  // WebAuthn refuses an IP address as the RP ID, so the page opens on localhost
  const appURL = proxy.url.replace('127.0.0.1', 'localhost');

  const view = new Bun.WebView({ backend: 'chrome' });

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({ deviceName: 'laptop' });

  await setupSignedInBrowser(view, { appURL, token: session.token });

  await view.cdp('WebAuthn.enable');

  const addedRaw = await view.cdp('WebAuthn.addVirtualAuthenticator', {
    options: {
      automaticPresenceSimulation: true,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      protocol: 'ctap2',
      transport: 'internal',
    },
  });

  const added = authenticatorSchema.parse(addedRaw);

  onTestFinished(async () => {
    await view.cdp('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: added.authenticatorId,
    });

    await view.cdp('WebAuthn.disable');
  });

  // Bun runs one Chrome for the whole test process, and runs these hooks in the order they were
  // added, so the view closes after its authenticator is gone.
  onTestFinished(() => {
    view.close();
  });

  return {
    api,
    appURL,
    view,
    countCredentials: async () => {
      const raw = await view.cdp('WebAuthn.getCredentials', {
        authenticatorId: added.authenticatorId,
      });

      return credentialsSchema.parse(raw).credentials.length;
    },
    waitForPage: (expression: string) => waitForPage(view, expression, 8000),
  };
}

test('it registers a passkey with a host code, lists it, and the authenticator holds the credential', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/passkeys`);

  // The list's arrival moves the form down, and a click lands where the button was
  await ctx.waitForPage(
    "document.body.innerText.includes('No passkey is set up yet.') && document.querySelector('form[aria-label=\"Add a passkey\"]') !== null",
  );

  await ctx.view.click('form[aria-label="Add a passkey"] label:nth-of-type(1) input');
  await ctx.view.type('Phone');
  await ctx.view.click('form[aria-label="Add a passkey"] label:nth-of-type(2) input');
  await ctx.view.type(mockPasskeyCode);
  await ctx.view.click('form[aria-label="Add a passkey"] button[type=submit]');
  await ctx.waitForPage(`document.querySelector('li[aria-label="Phone"]') !== null`);

  expect([
    store.passkeyRows.all().map((row) => row.label),
    await ctx.countCredentials(),
  ]).toStrictEqual([['Phone'], 1]);
});

test('it says that a host code is wrong and adds no passkey', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/passkeys`);

  // The list's arrival moves the form down, and a click lands where the button was
  await ctx.waitForPage(
    "document.body.innerText.includes('No passkey is set up yet.') && document.querySelector('form[aria-label=\"Add a passkey\"]') !== null",
  );

  await ctx.view.click('form[aria-label="Add a passkey"] label:nth-of-type(2) input');
  await ctx.view.type('WRONG-CODE1');
  await ctx.view.click('form[aria-label="Add a passkey"] button[type=submit]');
  await ctx.waitForPage(`document.body.innerText.includes('That code is unknown, used or lapsed')`);

  expect([store.passkeyRows.all(), await ctx.countCredentials()]).toStrictEqual([[], 0]);
});

test.each([
  ['an empty list', 0, `document.body.innerText.includes('No passkey is set up yet.')`],
  ['2 passkeys', 2, `document.querySelectorAll('ul[aria-label="Passkeys"] li').length === 2`],
])(
  'it keeps the Add a passkey button where it is when the list loads, with %s',
  async (_name, passkeyCount, loaded) => {
    const ctx = await setupTest();

    const readTop = () =>
      ctx.view.evaluate(
        `document.querySelector('form[aria-label="Add a passkey"] button[type=submit]').getBoundingClientRect().top`,
      );

    await Promise.all(
      Array.from({ length: passkeyCount }, (_item, index) =>
        store.passkeyRows.create({ label: `Phone ${index + 1}` }),
      ),
    );

    // The page paints before a read that takes this long, so it shows where the button sits without
    // the list.
    ctx.api.delayPath('/rpc/passkeys/list', 500);

    await ctx.view.navigate(`${ctx.appURL}/passkeys`);
    await ctx.waitForPage(`document.querySelector('form[aria-label="Add a passkey"]') !== null`);

    const before = await readTop();

    await ctx.waitForPage(loaded);

    const after = await readTop();

    expect(after).toBe(before);
  },
);
