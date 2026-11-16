import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { runInPage } from '@zgeoff/rig';
import { z } from 'zod';
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

  return { api, appURL: app.url, view };
}

test('it shows a hop-limit notice on a task page that opens the exchange', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });
  await store.tasks.create({ name: 'Seed order', taskID: 'p7hd2wq9zn' });

  await store.records.create({
    kind: 'task_message',
    taskMessage: {
      from: 'k3vq8m2xpa',
      fromName: 'Garden plan',
      hop: 21,
      kind: 'question',
      messageID: 'm7q2x9k4pa',
      text: 'Which seeds came?',
      to: 'p7hd2wq9zn',
      woke: false,
    },
    thread: 'p7hd2wq9zn',
  });

  await Promise.all(
    Array.from({ length: 120 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'p7hd2wq9zn' }),
    ),
  );

  await store.records.create({
    exchangeNotice: {
      link: { label: 'Open the exchange', messageID: 'm7q2x9k4pa', taskID: 'p7hd2wq9zn' },
      text: 'Garden plan and Seed order exchanged 21 messages with no outside cause. New messages between them wait for the next one. Garden plan is waiting on Seed order.',
    },
    kind: 'task.exchange_limited',
    thread: 'k3vq8m2xpa',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

  await waitFor(
    async () => {
      const notice: unknown = await ctx.view.evaluate(
        "document.querySelector('[role=note]')?.textContent ?? null",
      );

      expect(notice).toBe(
        'Garden plan and Seed order exchanged 21 messages with no outside cause. New messages between them wait for the next one. Garden plan is waiting on Seed order. Open the exchange',
      );
    },
    { timeout: 10_000 },
  );

  // The task's summary can render above the notice after it, and Bun clicks at the link's earlier
  // position, which the summary's prompt toggle then covers.
  await waitFor(
    async () => {
      const toggle: unknown = await ctx.view.evaluate(
        "document.querySelector('button[aria-controls]')?.textContent ?? null",
      );

      expect(toggle).toBe('Show the whole prompt');
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('a[href="/tasks/p7hd2wq9zn#task-message-m7q2x9k4pa"]');

  await waitFor(
    async () => {
      const message: unknown = await ctx.view.evaluate(
        "document.getElementById('task-message-m7q2x9k4pa')?.textContent ?? null",
      );

      expect(message).toBe(
        'From Garden plan · question · hop 21 · did not wake its receiverWhich seeds came?',
      );
    },
    { timeout: 10_000 },
  );

  await waitFor(
    async () => {
      const isInView: unknown = await ctx.view.evaluate(
        "(() => { const box = document.getElementById('task-message-m7q2x9k4pa').getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; })()",
      );

      expect(isInView).toBeTrue();
    },
    { timeout: 10_000 },
  );
});

test('it opens the whole of a long prompt on a task page, down to its last paragraph', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({
    brief:
      'Plan the vegetable beds for the spring planting.\nThe garden has four raised beds: two along the north fence, one by the shed and one in the middle of the lawn. Put the climbing beans where they get the most sun, and keep the tomatoes out of the shade of the shed.\nWhen the plan is ready, send it to the conversation as a report.',
    name: 'Garden plan',
    taskID: 'k3vq8m2xpa',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

  await waitFor(
    async () => {
      const hasToggle: unknown = await ctx.view.evaluate(
        "document.querySelector('button[aria-controls]') !== null",
      );

      expect(hasToggle).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('button[aria-controls]');

  await waitFor(
    async () => {
      const brief = await runInPage(
        ctx.view,
        () => {
          const toggle = document.querySelector('button[aria-controls]');

          const shown = document.querySelector(
            `[id="${toggle?.getAttribute('aria-controls') ?? ''}"]`,
          );

          return {
            isCut: shown === null || shown.scrollHeight > shown.clientHeight,
            isOpen: toggle?.getAttribute('aria-expanded') === 'true',
          };
        },
        null,
        z.object({ isCut: z.boolean(), isOpen: z.boolean() }),
      );

      expect(brief).toStrictEqual({ isCut: false, isOpen: true });
    },
    { timeout: 10_000 },
  );
});

test('it sends a message written on a task page to that task, not the conversation', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

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

test('it switches the mark of a task on its page, then closes the task from the same page', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ disposable: true, name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

  const clickButton = (group: string, label: string) =>
    runInPage(
      ctx.view,
      (target) => {
        const button = [...document.querySelectorAll(`[aria-label="${target.group}"] button`)].find(
          (candidate) => candidate.textContent === target.label,
        );

        if (button instanceof HTMLElement) {
          button.click();
        }

        return button !== undefined;
      },
      { group, label },
      z.boolean(),
    );

  const readSwitchChecked = () =>
    runInPage(
      ctx.view,
      (target) =>
        document
          .querySelector(`[aria-label="${target.group}"] [role="switch"]`)
          ?.getAttribute('aria-checked') ?? null,
      { group: 'Mark for Garden plan' },
      z.string().nullable(),
    );

  await waitFor(
    async () => {
      const checked = await readSwitchChecked();

      expect(checked).toBe('true');
    },
    { timeout: 10_000 },
  );

  await waitFor(
    async () => {
      const isClicked = await clickButton('Mark for Garden plan', 'Close when it finishes');

      expect(isClicked).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await waitFor(
    () => {
      expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))).toMatchObject(
        { disposable: false, state: 'waiting' },
      );
    },
    { timeout: 10_000 },
  );

  await waitFor(
    async () => {
      const checked = await readSwitchChecked();

      expect(checked).toBe('false');
    },
    { timeout: 10_000 },
  );

  await waitFor(
    async () => {
      const isClicked = await clickButton('Controls for Garden plan', 'Close');

      expect(isClicked).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await waitFor(
    async () => {
      const isClicked = await clickButton('Close the task', 'Close the task');

      expect(isClicked).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await waitFor(
    () => {
      expect(store.tasks.findFirst((query) => query.where({ taskID: 'k3vq8m2xpa' }))).toMatchObject(
        { disposable: false, state: 'closed' },
      );
    },
    { timeout: 10_000 },
  );
});

test('it says on the page of a closed task who closed it', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({
    closedBy: 'nixie',
    disposable: true,
    name: 'Garden plan',
    state: 'closed',
    taskID: 'k3vq8m2xpa',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.textContent');

      expect(text).toInclude('Closed by nixie');
    },
    { timeout: 10_000 },
  );
});

test.each([
  ['a brief and a waiting-on line', 'Plan the vegetable beds.', 'Waiting on Seed order'],
  ['no brief', '', 'Waiting on Seed order'],
])(
  'it keeps the linked message where it is when the task loads, with %s',
  async (_name, brief, summaryLine) => {
    const ctx = await setupTest();
    const session = await store.sessions.create({});

    await store.tasks.create({
      brief,
      name: 'Garden plan',
      taskID: 'k3vq8m2xpa',
      waitingOn: 'p7hd2wq9zn',
    });

    await store.tasks.create({ name: 'Seed order', taskID: 'p7hd2wq9zn', waitingOn: 'k3vq8m2xpa' });

    await store.records.create({
      exchangeNotice: {
        link: { label: 'Open the exchange', messageID: 'm7q2x9k4pa', taskID: 'p7hd2wq9zn' },
        text: 'Garden plan and Seed order exchanged 21 messages with no outside cause.',
      },
      kind: 'task.exchange_limited',
      thread: 'k3vq8m2xpa',
    });

    await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

    // The page paints before a read that takes this long, so it shows where the link sits without the
    // task's summary.
    ctx.api.delayPath('/rpc/tasks/read', 500);
    ctx.api.delayPath('/rpc/tasks/list', 500);

    const link = 'a[href="/tasks/p7hd2wq9zn#task-message-m7q2x9k4pa"]';

    const readTop = async () => {
      const top: unknown = await ctx.view.evaluate(
        `document.querySelector('${link}')?.getBoundingClientRect().top ?? null`,
      );

      return top;
    };

    await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

    await waitFor(
      async () => {
        const top = await readTop();

        expect(top).toBeNumber();
      },
      { timeout: 10_000 },
    );

    const before = await readTop();

    // The "Last activity" span renders only after hydration
    await waitFor(
      async () => {
        const text: unknown = await ctx.view.evaluate('document.body.innerText');

        expect(text).toInclude('Garden plan');
        expect(text).toInclude(summaryLine);
        expect(text).toInclude('Last activity');
      },
      { timeout: 10_000 },
    );

    const after = await readTop();

    expect(after).toBe(before);
  },
);
