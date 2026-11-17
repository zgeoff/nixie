import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import type { DefinitionsTables } from '../types';
import { definitionChangedCodec } from './definition-changed-codec';
import { writeTaskVersionRestore } from './write-task-version-restore';

interface ChangedVersion {
  readonly hash: string;
  readonly form: JSONObject;
}

async function setupTest() {
  const ctx = await startTestDefinitions();

  return {
    ...ctx,
    writeChanged: (version: ChangedVersion) =>
      withWriteTransaction(ctx.writer, (tx) =>
        writeRecordsInTransaction(tx, ctx.log, [
          {
            kind: definitionChangedCodec.kind,
            definitions: { snapshotHash: 'snap', personaVersion: 'persona' },
            thread: 'conversation',
            payload: definitionChangedCodec.encode({
              changeID: crypto.randomUUID(),
              shortID: 'abcd',
              definitionID: 'feed-the-cat',
              operation: 'add',
              hash: version.hash,
              previous: null,
              caller: 'conversation',
              undoes: null,
              replaces: null,
              base: null,
              definitions: null,
            }),
            erasable: {
              version: {
                definitionID: 'feed-the-cat',
                hash: version.hash,
                form: version.form,
                files: {},
              },
            },
          },
        ]),
      ),
    readVersions: () =>
      ctx.writer.db
        .$extendTables<DefinitionsTables>()
        .selectFrom('task_definition_versions')
        .select(['definition_hash', 'form'])
        .execute(),
  };
}

test('it restores a version without its target under the hash of the form without it', async () => {
  const ctx = await setupTest();

  await ctx.writeChanged({
    hash: 'a'.repeat(64),
    form: { name: 'Feed', brief: 'Feed the cat.', target: 'task' },
  });

  await writeTaskVersionRestore(ctx.log);

  const versions = await ctx.readVersions();

  expect(versions).toStrictEqual([
    {
      definition_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      form: '{"brief":"Feed the cat.","name":"Feed"}',
    },
  ]);

  expect(versions).not.toContainEqual(expect.objectContaining({ definition_hash: 'a'.repeat(64) }));
});

test('it restores no version of a conversation definition', async () => {
  const ctx = await setupTest();

  await ctx.writeChanged({
    hash: 'b'.repeat(64),
    form: { name: 'Feed', brief: 'Feed the cat.', target: 'conversation' },
  });

  await writeTaskVersionRestore(ctx.log);

  const versions = await ctx.readVersions();

  expect(versions).toStrictEqual([]);
});
