import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import invariant from 'tiny-invariant';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test('it shows the reply to a message sent from the page, and stops the spinner', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'The heron left the pond at dawn.' });

  // the image pickers turn on as the page hydrates, and a submit before that posts the bare form
  await waitForPage(
    ctx.view,
    "document.querySelector('input[type=file]:not([disabled])') !== null",
  );

  await ctx.view.click('textarea[aria-label="Message"]');
  await ctx.view.cdp('Input.insertText', { text: 'Where did the heron go?' });
  await ctx.view.click('button[type=submit]');

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('The heron left the pond at dawn.')",
  );

  await waitForPage(ctx.view, "document.querySelector('[role=progressbar]') === null");

  const text: unknown = await ctx.view.evaluate('document.body.innerText');

  expect(text).toInclude('Where did the heron go?');
});

test('it shows each reply as the model writes it, across a tool call that is still running and a reload, in the order of the records', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies(
    { text: 'Checking the pond.', toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'Checking the gate.', toolUse: { name: 'mcp__nixie__time_now', input: {} } },
    { text: 'The heron left at dawn.' },
    { text: 'The side gate is shut.' },
  );

  await ctx.server.request('arm', { point: 'time.now.running' });

  await waitForPage(
    ctx.view,
    "document.querySelector('input[type=file]:not([disabled])') !== null",
  );

  await ctx.view.click('textarea[aria-label="Message"]');
  await ctx.view.cdp('Input.insertText', { text: 'Where did the heron go?' });
  await ctx.view.click('button[type=submit]');

  // the first tool call is open, so the turn is still running with its first reply on the page
  const firstCall = await ctx.server.waitForArrival('time.now.running');

  await waitForPage(ctx.view, "document.body.innerText.includes('Checking the pond.')");

  const heldText: unknown = await ctx.view.evaluate('document.body.innerText');

  expect(heldText).not.toInclude('The heron left at dawn.');

  await ctx.api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'And the side gate?',
    thread: 'conversation',
  });

  const heldPage = await ctx.api.client.conversation.read({ thread: 'conversation' });

  const heldKinds = heldPage.records
    .filter((record) => ['owner_message', 'model.reply', 'tool_called'].includes(record.kind))
    .map((record) => record.kind);

  // the reply stands ahead of the call it was written with, and the new owner message behind both
  expect(heldKinds).toStrictEqual(['owner_message', 'model.reply', 'tool_called', 'owner_message']);

  // a reload while the call is open still shows the reply, once
  await ctx.view.navigate(ctx.appURL);

  await waitForPage(ctx.view, "document.body.innerText.includes('Checking the pond.')");

  const heldReloadedText: unknown = await ctx.view.evaluate('document.body.innerText');

  invariant(typeof heldReloadedText === 'string');

  expect(heldReloadedText.split('Checking the pond.')).toHaveLength(2);
  expect(heldReloadedText).toInclude('And the side gate?');

  ctx.server.release(firstCall);

  await waitForPage(ctx.view, "document.body.innerText.includes('The heron left at dawn.')");

  await waitForCondition(async () => {
    const read = await ctx.api.client.conversation.read({ thread: 'conversation' });

    return read.records.some((record) => record.kind === 'task.step_committed');
  });

  const liveText: unknown = await ctx.view.evaluate('document.body.innerText');

  await ctx.view.navigate(ctx.appURL);

  await waitForPage(ctx.view, "document.body.innerText.includes('The heron left at dawn.')");

  const reloadedText: unknown = await ctx.view.evaluate('document.body.innerText');
  const page = await ctx.api.client.conversation.read({ thread: 'conversation' });

  const replyTexts = ['Checking the pond.', 'Checking the gate.', 'The heron left at dawn.'];
  const replies = page.records.filter((record) => record.kind === 'model.reply');

  expect(replies.slice(0, 3).map((record) => record.message?.text)).toStrictEqual(replyTexts);

  expect(
    page.records
      .filter((record) => ['model.reply', 'tool_called'].includes(record.kind))
      .slice(0, 5)
      .map((record) => record.kind),
  ).toStrictEqual(['model.reply', 'tool_called', 'model.reply', 'tool_called', 'model.reply']);

  const order = /Checking the pond\.[\s\S]*Checking the gate\.[\s\S]*The heron left at dawn\./u;

  invariant(typeof liveText === 'string' && typeof reloadedText === 'string');

  expect([liveText, reloadedText]).toSatisfyAll((text: string) => order.test(text));

  expect(
    [liveText, reloadedText].map((text) => replyTexts.map((reply) => text.split(reply).length - 1)),
  ).toStrictEqual([
    [1, 1, 1],
    [1, 1, 1],
  ]);
});
