import { expect, onTestFinished, test } from 'bun:test';
import { createTestClient, runHostCommand } from '@heynixie/server/test-utils';
import { checkBrowserSkip, setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

const browserSkip = await checkBrowserSkip();

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return journey;
}

test.skipIf(browserSkip.isSkipped)(
  'it drops the old conversation from the open tab and stops its spinner after a reset, and the tab carries on',
  async () => {
    const ctx = await setupTest();

    const heldReply = Promise.withResolvers<void>();

    onTestFinished(() => {
      heldReply.resolve();
    });

    ctx.nixie.model.addReplies(
      { text: 'The swifts are back.', gate: heldReply.promise },
      { text: 'Not yet, give it a week.' },
    );

    // the image pickers turn on as the page hydrates, and a submit before that posts the bare form
    await waitForPage(
      ctx.view,
      "document.querySelector('input[type=file]:not([disabled])') !== null",
    );

    await ctx.view.click('textarea[aria-label="Message"]');
    await ctx.view.cdp('Input.insertText', { text: 'Have the swifts come back yet?' });
    await ctx.view.click('button[type=submit]');

    await waitForPage(ctx.view, "document.querySelector('[role=progressbar]') !== null");

    await ctx.nixie.waitForModelCalls(1);

    const reset = runHostCommand(ctx.nixie.configPath, ['reset', '--keep-sessions', '--yes']);

    // the reset waits for each turn in flight, up to the runners' 30 s stop grace, so the held
    // reply goes out once the reset starts
    await ctx.server.waitForLogEvent('reset.started');

    heldReply.resolve();

    const command = await reset;

    await ctx.server.exited;

    await ctx.startServer();

    // the tab backs off between its tries to follow the log while nixie is down; a device that
    // comes back online follows again at once, which keeps the backoff out of the test's time
    await ctx.view.evaluate("dispatchEvent(new Event('online'))");

    await waitForPage(ctx.view, "document.querySelector('[role=note][aria-label=reset]') !== null");

    const afterReset: unknown = await ctx.view.evaluate(
      "({ hasMessage: document.body.innerText.includes('Have the swifts come back yet?'), hasSpinner: document.querySelector('[role=progressbar]') !== null })",
    );

    expect({ exitCode: command.exitCode, page: afterReset }).toStrictEqual({
      exitCode: 0,
      page: { hasMessage: false, hasSpinner: false },
    });

    await ctx.view.click('textarea[aria-label="Message"]');
    await ctx.view.cdp('Input.insertText', { text: 'And now?' });
    await ctx.view.click('button[type=submit]');

    await waitForPage(ctx.view, "document.body.innerText.includes('Not yet, give it a week.')");

    const text: unknown = await ctx.view.evaluate('document.body.innerText');

    expect(text).not.toInclude('The swifts are back.');
  },
);
