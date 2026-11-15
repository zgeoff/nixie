import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { z } from 'zod';
import { mockPasskeyCode } from '../mocks/passkey-rows';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

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
    appURL,
    view,
    countCredentials: async () => {
      const raw = await view.cdp('WebAuthn.getCredentials', {
        authenticatorId: added.authenticatorId,
      });

      return credentialsSchema.parse(raw).credentials.length;
    },
    waitForPage: (expression: string) =>
      waitFor(
        async () => {
          const holds: unknown = await view.evaluate(expression);

          expect(holds).toBeTrue();
        },
        { timeout: 8000 },
      ),
  };
}

test('it registers a passkey with a host code, lists it, and the authenticator holds the credential', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(`${ctx.appURL}/passkeys`);

  // React marks the document as it hydrates it, and a submit before that posts the bare form
  await ctx.waitForPage(
    "Object.keys(document).some((key) => key.startsWith('_reactListening')) && document.querySelector('form[aria-label=\"Add a passkey\"]') !== null",
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

  await ctx.waitForPage(
    "Object.keys(document).some((key) => key.startsWith('_reactListening')) && document.querySelector('form[aria-label=\"Add a passkey\"]') !== null",
  );

  await ctx.view.click('form[aria-label="Add a passkey"] label:nth-of-type(2) input');
  await ctx.view.type('WRONG-CODE1');
  await ctx.view.click('form[aria-label="Add a passkey"] button[type=submit]');
  await ctx.waitForPage(`document.body.innerText.includes('That code is unknown, used or lapsed')`);

  expect([store.passkeyRows.all(), await ctx.countCredentials()]).toStrictEqual([[], 0]);
});
