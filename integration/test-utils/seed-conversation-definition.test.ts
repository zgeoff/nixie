import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { startTestDefinitions } from '@heynixie/definitions/test-utils';
import { sql } from 'kysely';
import { z } from 'zod';
import { seedConversationDefinition } from './seed-conversation-definition';

async function setupTest() {
  const ctx = await startTestDefinitions();

  return {
    ...ctx,
    readVersionForms: () =>
      readQueryRows(
        sql`select definition_hash, form from task_definition_versions`,
        ctx.writer.db,
        z.object({ definition_hash: z.string(), form: z.string() }),
      ),
    readArmed: () =>
      readQueryRows(
        sql`select definition_id, definition_hash, target from trigger_definitions`,
        ctx.writer.db,
        z.object({
          definition_id: z.string(),
          definition_hash: z.string().nullable(),
          target: z.string(),
        }),
      ),
    readChangeIDs: () =>
      readQueryRows(
        sql`select change_id, state from runtime_task_definitions`,
        ctx.writer.db,
        z.object({ change_id: z.string(), state: z.string() }),
      ),
  };
}

test('it writes a version that names the conversation target, and arms its trigger', async () => {
  const ctx = await setupTest();

  await seedConversationDefinition(ctx, {
    definitionID: 'water-the-tomatoes',
    hash: 'a'.repeat(64),
    name: 'Tomatoes',
    note: 'Water the tomatoes.',
    trigger: { at: '2027-03-09T14:00:00+11:00' },
    changeID: null,
  });

  const forms = await ctx.readVersionForms();
  const armed = await ctx.readArmed();
  const changes = await ctx.readChangeIDs();

  expect(forms).toStrictEqual([
    {
      definition_hash: 'a'.repeat(64),
      form: '{"brief":"Water the tomatoes.","enabled":true,"name":"Tomatoes","target":"conversation","trigger":{"at":"2027-03-09T14:00:00+11:00"}}',
    },
  ]);

  expect(armed).toStrictEqual([
    {
      definition_id: 'water-the-tomatoes',
      definition_hash: 'a'.repeat(64),
      target: 'conversation',
    },
  ]);

  expect(changes).toStrictEqual([]);
});

test('it writes the runtime change of a definition that a change put in force', async () => {
  const ctx = await setupTest();

  await seedConversationDefinition(ctx, {
    definitionID: 'call-the-dentist',
    hash: 'b'.repeat(64),
    name: 'Dentist',
    note: 'Call the dentist.',
    trigger: { at: '2027-03-09T14:00:00+11:00' },
    changeID: 'c1',
  });

  const changes = await ctx.readChangeIDs();

  expect(changes).toStrictEqual([{ change_id: 'c1', state: 'in_force' }]);
});
