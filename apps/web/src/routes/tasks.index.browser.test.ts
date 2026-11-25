import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { pauseStore } from '../mocks/pause-store';
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

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return {
    appURL: app.url,
    view,
    readPageText: () => view.evaluate('document.body.innerText'),
    readFilterValue: (label: string) =>
      view.evaluate(
        `[...document.querySelectorAll('label')].find((label) => label.textContent.startsWith('${label}')).querySelector('select').selectedOptions[0].textContent`,
      ),
    chooseFilter: (label: string, value: string) =>
      view.evaluate(
        `(() => {
          const select = [...document.querySelectorAll('label')].find((label) => label.textContent.startsWith('${label}')).querySelector('select');
          const option = [...select.options].find((candidate) => candidate.textContent === '${value}');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, option.value);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        })()`,
      ),
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

  // The page moves the paused task from Working to Held only once its list reads again, and a
  // click that lands while the row moves misses the link.
  await waitForPage(
    ctx.view,
    `document.querySelector('section[aria-label="Held"] a[href="/tasks/k3vq8m2xpa"]') !== null`,
  );

  await ctx.view.click('a[href="/tasks/k3vq8m2xpa"]');

  await waitForPage(ctx.view, "document.querySelector('textarea:enabled') !== null");

  await ctx.view.click('textarea');
  await ctx.view.cdp('Input.insertText', { text: 'Put the beans in the north bed.' });

  await waitForPage(
    ctx.view,
    "document.querySelector('textarea').value === 'Put the beans in the north bed.'",
  );

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

test('it groups each listed state, and shows a catch-up fire with how late it fired', async () => {
  const ctx = await setupTest();

  // Chrome is already running with the host's zone, so the page takes its own
  await ctx.view.cdp('Emulation.setTimezoneOverride', { timezoneId: 'America/Chicago' });

  const session = await store.sessions.create({});

  await store.tasks.create({ listedState: 'idle', name: 'Idle task', state: 'waiting' });
  await store.tasks.create({ listedState: 'finished', name: 'Finished task', state: 'waiting' });
  await store.tasks.create({ listedState: 'failed', name: 'Failed task', state: 'failed' });

  await store.tasks.create({
    definitionID: 'water-the-tomatoes',
    listedState: 'asleep',
    name: 'Water the tomatoes',
    nextRunAt: '2027-03-12T13:00:00.000Z',
    state: 'waiting',
    fire: {
      firedAt: '2027-03-11T21:20:00.000Z',
      isCatchUp: true,
      scheduledFor: '2027-03-11T21:00:00.000Z',
    },
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitFor(
    async () => {
      const working: unknown = await ctx.view.evaluate(
        "document.querySelector('section[aria-label=\"Working\"]')?.innerText ?? ''",
      );

      const held: unknown = await ctx.view.evaluate(
        "document.querySelector('section[aria-label=\"Held\"]')?.innerText ?? ''",
      );

      const tomatoesText = await ctx.readRowText('Water the tomatoes');

      const tomatoes = String(tomatoesText).replaceAll(/\s/gu, ' ');

      expect(working).toInclude('Idle task');
      expect(working).toInclude('Finished task');
      expect(working).toInclude('Sent its report');
      expect(working).toInclude('Water the tomatoes');
      expect(held).toInclude('Failed task');
      expect(tomatoes).toInclude('Scheduled Mar 11, 3:00 PM, fired 20 minutes late');
      expect(tomatoes).toInclude('Next run Mar 12, 7:00 AM');
    },
    { timeout: 10_000 },
  );
});

test('it keeps the conversation in its own group while nixie is paused', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({
    listedState: 'idle',
    name: 'Conversation',
    state: 'waiting',
    taskID: 'conversation',
  });

  await store.tasks.create({ listedState: 'idle', name: 'Garden plan', state: 'waiting' });
  await pauseStore.pauses.create({ cause: 'owner' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitFor(
    async () => {
      const conversation: unknown = await ctx.view.evaluate(
        "document.querySelector('section[aria-label=\"Conversation\"]')?.innerText ?? ''",
      );

      const held: unknown = await ctx.view.evaluate(
        "document.querySelector('section[aria-label=\"Held\"]')?.innerText ?? ''",
      );

      expect(conversation).toInclude('Conversation');
      expect(held).toInclude('Garden plan');
      expect(held).not.toInclude('Conversation');
    },
    { timeout: 10_000 },
  );
});

test('it keeps a filter and the filtered list after a reload', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ listedState: 'failed', name: 'Seed order', state: 'failed' });
  await store.tasks.create({ listedState: 'idle', name: 'Tiler booking', state: 'waiting' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitFor(
    async () => {
      const text = await ctx.readPageText();

      expect(text).toInclude('Tiler booking');
    },
    { timeout: 10_000 },
  );

  await ctx.chooseFilter('State', 'Failed');

  await waitFor(
    async () => {
      const text = await ctx.readPageText();

      expect(text).toInclude('Seed order');
      expect(text).not.toInclude('Tiler booking');
    },
    { timeout: 10_000 },
  );

  const location = await ctx.view.evaluate('location.href');

  const href = String(location);

  await ctx.view.navigate(href);

  await waitFor(
    async () => {
      const text = await ctx.readPageText();
      const filter = await ctx.readFilterValue('State');

      expect(filter).toBe('Failed');
      expect(text).toInclude('Seed order');
      expect(text).not.toInclude('Tiler booking');
    },
    { timeout: 10_000 },
  );
});

test('it reads the list again when a trigger fires', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  const task = await store.tasks.create({
    definitionID: 'water-the-tomatoes',
    listedState: 'asleep',
    name: 'Water the tomatoes',
    state: 'waiting',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks`);

  await waitFor(
    async () => {
      const row = await ctx.readRowText('Water the tomatoes');

      expect(row).toInclude('Asleep');
    },
    { timeout: 10_000 },
  );

  await store.tasks.update(task, {
    data(draft) {
      draft.listedState = 'running';
      draft.state = 'running';
    },
  });

  await store.records.create({ kind: 'trigger.fired', thread: task.taskID });

  await waitFor(
    async () => {
      const row = await ctx.readRowText('Water the tomatoes');

      expect(row).toInclude('Running');
    },
    { timeout: 10_000 },
  );
});
