import { expect, test } from 'bun:test';
import { startTestRules } from '@heynixie/api/test-utils';
import { runMandateExpiry } from '@heynixie/definitions';
import { buildEventRegistry, readEventsNote } from '@heynixie/sessions';
import invariant from 'tiny-invariant';
import { buildMandateEndedKind } from './build-mandate-ended-kind';
import { buildMandateStartedKind } from './build-mandate-started-kind';

async function setupTest() {
  const rules = await startTestRules();

  const proposed = await rules.proposeMandate({
    title: 'Full authority over my calendar invites',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  await rules.answer(proposed.proposalID, 'approve');

  return {
    ...rules,
    mandateID: proposed.mandateID,
    readNote: () =>
      readEventsNote(
        buildEventRegistry([buildMandateStartedKind(rules.log), buildMandateEndedKind(rules.log)]),
        { after: 0, through: 1000 },
        { ownerName: 'Avery', timeZone: 'Australia/Sydney' },
      ),
  };
}

test('it tells the conversation that a mandate started, with its end in the zone of the owner', async () => {
  const ctx = await setupTest();
  const note = await ctx.readNote();

  expect(note).toContain(
    `Mandate ${ctx.mandateID} started: Full authority over my calendar invites, until 00:00 Sydney.`,
  );
});

test('it tells the next turn that the timer ended the mandate', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(5 * 60 * 60 * 1000);

  await runMandateExpiry(ctx.rulesContext);

  const note = await ctx.readNote();

  expect(note).toContain(
    `Mandate ${ctx.mandateID} ended (expired): Full authority over my calendar invites.`,
  );
});

test('it renders an ended mandate without its title once a record forget removed it', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(5 * 60 * 60 * 1000);

  await runMandateExpiry(ctx.rulesContext);

  await ctx.forgetMandateTitle(ctx.mandateID);

  const note = await ctx.readNote();

  expect(note).toContain(`Mandate ${ctx.mandateID} ended (expired).`);
});
