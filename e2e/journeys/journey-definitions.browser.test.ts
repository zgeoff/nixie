import { expect, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { setupSignedInBrowser, waitForPage } from '@heynixie/web/test-utils';
import { startWebJourney } from '../src/test-utils/start-web-journey';

async function setupTest() {
  const journey = await startWebJourney();
  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  return { ...journey, api };
}

test('it lists a definition that a turn made with the record that created it, and its undo puts it out of force', async () => {
  const ctx = await setupTest();

  const text = 'Remind me every Friday at 08:00 to water the tomatoes.';

  // the second reply answers the consent checker, which reads the owner's typed words
  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__task_define',
        input: {
          name: 'Water the tomatoes',
          brief: 'Remind the owner to water the tomatoes.',
          target: 'conversation',
          trigger: {
            schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
          },
        },
      },
    },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
    { text: 'I set that reminder for every Friday at 08:00.' },
  );

  await ctx.api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [{ start: 0, end: text.length, source: 'typed' }],
    text,
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.definitionNotice !== undefined);
  });

  await ctx.view.navigate(`${ctx.appURL}/definitions`);

  const row = 'li[aria-label="Water the tomatoes"]';

  await waitForPage(ctx.view, `document.querySelector('${row}') !== null`);

  const shown: unknown = await ctx.view.evaluate(`document.querySelector('${row}').innerText`);

  expect(shown).toInclude('every Friday at 08:00');
  expect(shown).toInclude('Made by nixie · created by the definition.changed record');

  await waitForPage(
    ctx.view,
    `document.querySelector('${row} button[name="undo-definition"]:not([disabled])') !== null`,
  );

  await ctx.view.evaluate(
    `document.querySelector('${row} button[name="undo-definition"]').click()`,
  );

  await waitForPage(ctx.view, `document.querySelector('${row}') === null`);
});
