import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { z } from 'zod';
import { store } from '../mocks/store';
import { checkBrowserSkip } from '../test-utils/check-browser-skip';
import { createBrowserView } from '../test-utils/create-browser-view';
import { runInPage } from '../test-utils/run-in-page';
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
  const view = createBrowserView();

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { appURL: app.url, view };
}

test.skipIf(browserSkip.isSkipped)(
  'it shows a hop-limit notice on a task page that opens the exchange',
  async () => {
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
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it opens the whole of a long prompt on a task page, down to its last paragraph',
  async () => {
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
  },
);

test.skipIf(browserSkip.isSkipped)(
  'it sends a message written on a task page to that task, not the conversation',
  async () => {
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
  },
);
