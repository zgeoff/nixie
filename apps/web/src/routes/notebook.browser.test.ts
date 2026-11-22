import { expect, onTestFinished, test } from 'bun:test';
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

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({});

  const open = async (path: string) => {
    await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

    await view.navigate(`${app.url}${path}`);
  };

  return { view, open };
}

test('it lists the notes newest edit first and leaves out the private one', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    versions: [{ at: new Date('2026-11-19T08:00:00Z'), title: 'Boiler notes (old)', body: 'Old.' }],
  });

  await mockViewStore.notes.create({
    versions: [
      { at: new Date('2026-11-21T08:00:00Z'), title: 'Why the boiler trips', body: 'At night.' },
    ],
  });

  await mockViewStore.notes.create({
    isPrivate: true,
    versions: [{ at: new Date('2026-11-20T08:00:00Z'), title: 'Winter diary', body: 'Rain.' }],
  });

  await ctx.open('/notebook');

  await waitForPage(ctx.view, "document.body.innerText.includes('Why the boiler trips')");

  const rows: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('ul[aria-label=Notes] > li a')].map((link) => link.innerText)",
  );

  expect(rows).toStrictEqual(['Why the boiler trips', 'Boiler notes (old)']);
});

test('it shows a note with its links and backlinks', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'n4w8k2c6rd',
    versions: [{ at: new Date(), title: 'Why the boiler trips', body: 'It trips at night.' }],
    links: [{ kind: 'note', target: 'h2m9t4x7qa', type: 'supersedes', reason: 'a rewrite' }],
  });

  await mockViewStore.notes.create({
    note: 'h2m9t4x7qa',
    versions: [{ at: new Date(), title: 'Boiler notes (old)', body: 'Old.' }],
  });

  await ctx.open('/notebook/n4w8k2c6rd');

  await waitForPage(ctx.view, "document.body.innerText.includes('a rewrite')");

  const links: unknown = await ctx.view.evaluate(
    "document.querySelector('section[aria-label=Links]').innerText",
  );

  expect(links).toInclude('Boiler notes (old)');

  await ctx.open('/notebook/h2m9t4x7qa');

  await waitForPage(ctx.view, "document.body.innerText.includes('Why the boiler trips')");

  const backlinks: unknown = await ctx.view.evaluate(
    "document.querySelector('section[aria-label=Backlinks]').innerText",
  );

  expect(backlinks).toInclude('Why the boiler trips');
});

test('it folds a private note and shows its body once Open is pressed', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [
      {
        at: new Date('2026-11-18T08:00:00Z'),
        title: 'Winter diary',
        body: 'Dear diary, it rained.',
      },
      {
        at: new Date('2026-11-20T08:00:00Z'),
        title: 'Winter diary',
        body: 'Dear diary, it snowed.',
      },
    ],
  });

  await ctx.open('/notebook?private=1');

  await waitForPage(ctx.view, "document.body.innerText.includes('Winter diary')");

  await ctx.view.click('a[href*="d8p3q1z6mw"]');

  await waitForPage(ctx.view, "document.body.innerText.includes('Its body is folded')");

  const isBodyShown: unknown = await ctx.view.evaluate(
    "document.body.innerText.includes('it snowed')",
  );

  expect(isBodyShown).toBe(false);

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.textContent === 'Open').click()",
  );

  await waitForPage(ctx.view, "document.body.innerText.includes('Dear diary, it snowed.')");

  expect(mockViewStore.noteOpens.all()).toHaveLength(1);
});

test('it says only that a note is private when Show private is off', async () => {
  const ctx = await setupTest();

  await mockViewStore.notes.create({
    note: 'd8p3q1z6mw',
    isPrivate: true,
    versions: [{ at: new Date(), title: 'Winter diary', body: 'Dear diary.' }],
  });

  await ctx.open('/notebook/d8p3q1z6mw');

  await waitForPage(ctx.view, "document.body.innerText.includes('This note is private')");

  const isTitleShown: unknown = await ctx.view.evaluate(
    "document.body.innerText.includes('Winter diary')",
  );

  expect(isTitleShown).toBe(false);
});
