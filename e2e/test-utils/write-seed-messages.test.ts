import { expect, test } from 'bun:test';
import { startTestNixie } from './start-test-nixie';
import { writeSeedMessages } from './write-seed-messages';

// a crash test's data directory, with no nixie started on it
async function setupTest() {
  return { nixie: await startTestNixie() };
}

test('it records the messages where nixie reads them once it starts', async () => {
  const ctx = await setupTest();
  const sequences = await writeSeedMessages(ctx.nixie, ['I live at 4 Elm Row.', 'I work nights.']);
  const records = await ctx.nixie.readRecords();

  expect(records).toMatchObject([
    { sequence: sequences[0], kind: 'owner_message', thread: 'conversation' },
    { sequence: sequences[1], kind: 'owner_message', thread: 'conversation' },
  ]);
});

test('it lets go of the data directory, so nixie can take it', async () => {
  const ctx = await setupTest();

  await writeSeedMessages(ctx.nixie, ['I live at 4 Elm Row.']);

  const first = ctx.nixie.harness.start();

  await first.ready;

  expect(ctx.nixie.harness.now()).toBe(1_000_000);
}, 60_000);
