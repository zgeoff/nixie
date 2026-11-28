import { writeRecords } from '@heynixie/log';
import { readConnectionRows } from '../connection/read-connection-rows';
import { runWithoutCodec } from '../record/run-without-codec';
import type { ServiceContext } from '../service-context';
import { pickRowAttention } from './pick-row-attention';

// Notes a job run that started with each of its pinned connections broken, so the return to `active`
// can count the runs of the break. A connection that works, expires soon or is gone gets no note.
// Returns how many it wrote.
export async function writeRunsWithout(
  context: ServiceContext,
  pinned: ReadonlySet<string>,
): Promise<number> {
  const rows = await readConnectionRows(context.log);

  const nowMs = context.now();

  const broken = rows.filter((row) => {
    const status = pickRowAttention(row, nowMs);

    return (
      pinned.has(row.short_id) &&
      (status === 'failing' || status === 'needs_consent' || status === 'disconnected')
    );
  });

  await writeRecords(
    context.log,
    broken.map((row) => ({
      kind: runWithoutCodec.kind,
      definitions: context.definitions(),
      payload: runWithoutCodec.encode({ connection: row.connection_id }),
    })),
  );

  return broken.length;
}
