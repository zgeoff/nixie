import type { Log, LogTables } from '@heynixie/log';
import { makeErasureRunner } from '@heynixie/log';
import { buildTestErasable, buildTestErasureEffects } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';

// What a record forget does to a record's text, run through the erasure runner: the erasure starts,
// the record's key goes, and the erasure finishes. The record stays.
export async function forgetTestRecord(log: Log, sequence: number): Promise<void> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', sequence)
    .executeTakeFirst();

  invariant(typeof row?.key_id === 'string', `the record ${String(sequence)} has no key`);

  const runner = makeErasureRunner({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    effects: buildTestErasureEffects().effects,
  });

  const id = String(sequence);

  const handle = runner.register(
    buildTestErasable({
      kind: 'record',
      childKind: 'image',
      targets: [{ id, keyIDs: [row.key_id], childIDs: [] }],
      events: [],
    }),
  );

  await handle.begin({ id }, { by: 'user' });
  await handle.finish(id);
}
