import { expect, onTestFinished, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
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

  const open = async () => {
    await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

    await view.navigate(`${app.url}/`);
  };

  return { view, open };
}

test('it shows the reply of a failed attempt muted, with its label and cause, and keeps the rerun reply', async () => {
  const ctx = await setupTest();

  await store.records.create({
    kind: 'owner_message',
    sequence: 1,
    message: { text: 'Which beds need water today?' },
  });

  await store.records.create({
    kind: 'task.step_started',
    sequence: 2,
    task: { stepKey: 'step-1', taskID: 'conversation' },
  });

  await store.records.create({
    kind: 'model.reply',
    sequence: 3,
    message: { text: 'The north bed and the herb bed.' },
  });

  await store.records.create({
    kind: 'task.step_errored',
    sequence: 4,
    task: { reason: 'model_api.overloaded', stepKey: 'step-1', taskID: 'conversation' },
  });

  await store.records.create({
    kind: 'task.step_started',
    sequence: 5,
    task: { stepKey: 'step-2', taskID: 'conversation' },
  });

  await store.records.create({
    kind: 'model.reply',
    sequence: 6,
    message: { text: 'The north bed and the herb bed need water today.' },
  });

  await store.records.create({ kind: 'task.step_committed', sequence: 7 });
  await ctx.open();

  const label = 'Not sent: this attempt failed, and Nix tried again (Claude is overloaded)';

  await waitForPage(ctx.view, `document.body.innerText.includes('${label}')`);

  const shot = await ctx.view.screenshot({ format: 'png' });

  const directory = process.env['VOIDED_REPLY_SHOT_DIR'];

  if (directory !== undefined) {
    await mkdir(directory, { recursive: true });

    await Bun.write(join(directory, 'voided-reply.png'), shot);
  }

  const replies: unknown = await ctx.view.evaluate(
    "[...document.querySelectorAll('ol[aria-label=Conversation] > li')].map((item) => item.textContent)",
  );

  expect(replies).toStrictEqual([
    'You Which beds need water today?Forget',
    'conversation · failed: Claude is overloaded · no tools · 0.0sSteptask conversation · step step-1 · events: started, erroredTools 0ErrorClaude is overloaded',
    `nixie ${label}The north bed and the herb bed.Forget`,
    'conversation · no tools · 0.0sSteptask conversation · step step-2 · events: started, committedTools 0',
    'nixie The north bed and the herb bed need water today.Forget',
  ]);
});
