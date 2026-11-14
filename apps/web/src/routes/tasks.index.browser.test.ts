import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { pauseStore } from '../mocks/pause-store';
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

  return {
    appURL: app.url,
    view,
    readPageText: () => view.evaluate('document.body.innerText'),
    readRowText: (name: string) =>
      view.evaluate(`document.querySelector('li[aria-label="${name}"]')?.innerText ?? ''`),
    clickButton: (label: string, within: string) =>
      view.evaluate(
        `[...document.querySelectorAll('${within} button')].find((button) => button.textContent === '${label}').click()`,
      ),
  };
}

test('it pauses a task from the dashboard, then opens it and sends it a message', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitFor(
    async () => {
      const hasPause: unknown = await ctx.view.evaluate(
        "[...document.querySelectorAll('button')].some((button) => button.textContent === 'Pause')",
      );

      expect(hasPause).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await ctx.view.evaluate(
    "[...document.querySelectorAll('button')].find((button) => button.textContent === 'Pause').click()",
  );

  await waitFor(
    () => {
      expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))?.state).toBe(
        'paused',
      );
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('a[href="/tasks/k3vq8m2xpa"]');

  await waitFor(
    async () => {
      const hasComposer: unknown = await ctx.view.evaluate(
        "document.querySelector('textarea') !== null",
      );

      expect(hasComposer).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('textarea');
  await ctx.view.cdp('Input.insertText', { text: 'Put the beans in the north bed.' });
  await ctx.view.click('button[type=submit]');

  await waitFor(
    () => {
      expect(
        store.records.findFirst((query) => query.where({ kind: 'owner_message' })),
      ).toMatchObject({
        message: { text: 'Put the beans in the north bed.' },
        thread: 'k3vq8m2xpa',
      });
    },
    { timeout: 10_000 },
  );
});

test('it shows the pause banner, each task as paused and the tasks to check, and runs one task or all of nixie on a resume', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Garden plan', state: 'waiting', taskID: 'k3vq8m2xpa' });
  await store.tasks.create({ name: 'Seed order', state: 'waiting', taskID: 'p7hd2wq9zn' });
  await pauseStore.pauses.create({ cause: 'restore' });

  await pauseStore.recoveries.create({
    toCheck: [
      {
        taskID: 'k3vq8m2xpa',
        name: 'Garden plan',
        stateAtBackup: 'running',
        wasRunning: true,
        pendingActions: 1,
      },
    ],
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitFor(
    async () => {
      const text = await ctx.readPageText();

      expect(text).toInclude('nixie is paused by a restore');
      expect(text).toInclude('Garden plan was running at the backup, and a step was running');
      expect(text).toInclude('Resume nixie');
    },
    { timeout: 10_000 },
  );

  await waitFor(
    async () => {
      const garden = await ctx.readRowText('Garden plan');
      const seeds = await ctx.readRowText('Seed order');

      expect(garden).toInclude('Paused by nixie');
      expect(seeds).toInclude('Paused by nixie');
    },
    { timeout: 10_000 },
  );

  await ctx.clickButton('Resume', 'li[aria-label="Garden plan"]');

  await waitFor(
    async () => {
      const garden = await ctx.readRowText('Garden plan');
      const seeds = await ctx.readRowText('Seed order');

      expect(garden).not.toInclude('Paused by nixie');
      expect(seeds).toInclude('Paused by nixie');
    },
    { timeout: 10_000 },
  );

  await ctx.clickButton('Resume nixie', 'section[aria-label="nixie is paused"]');

  await waitFor(
    async () => {
      const text = await ctx.readPageText();

      expect(text).not.toInclude('nixie is paused');
      expect(text).not.toInclude('Paused by nixie');
    },
    { timeout: 10_000 },
  );
});
