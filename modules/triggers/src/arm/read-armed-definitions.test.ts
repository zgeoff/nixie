import { expect, test } from 'bun:test';
import { buildTestArmedDefinition, seedArmedDefinitions, startTestTriggers } from '../test-utils';
import { readArmedDefinitions } from './read-armed-definitions';

test('it reads the armed definitions of one source with their watermark', async () => {
  const triggers = await startTestTriggers();

  await seedArmedDefinitions(triggers, [buildTestArmedDefinition()]);

  const rows = await readArmedDefinitions(triggers.writer.db, 'schedule');

  expect(rows).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      target: 'task',
      trigger: {
        schedule: { every: 'day', at: '08:00', zone: 'Australia/Sydney', catchUp: 'once' },
      },
      after: Date.parse('2027-03-09T00:00:00Z'),
      hold: null,
    },
  ]);
});

test('it leaves out a withdrawn definition and one of another source', async () => {
  const triggers = await startTestTriggers();

  await seedArmedDefinitions(triggers, [buildTestArmedDefinition()]);
  await seedArmedDefinitions(triggers, []);

  const schedule = await readArmedDefinitions(triggers.writer.db, 'schedule');
  const poll = await readArmedDefinitions(triggers.writer.db, 'poll');

  expect([schedule, poll]).toStrictEqual([[], []]);
});
