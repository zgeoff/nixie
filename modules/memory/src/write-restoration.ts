import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { MemoryStateError } from './memory-state-error';
import { parseEvidence } from './parse-evidence';
import type { MemoryTables, RestoreRequest, StoreParts, VersionRef } from './types';
import { writeMemoryVersion } from './write-memory-version';

export function writeRestoration(parts: StoreParts, request: RestoreRequest): Promise<VersionRef> {
  return writeMemoryVersion(parts, {
    requirement: { target: request.target, operation: 'restore', states: ['active', 'retired'] },
    provenance: request.provenance,
    writeInTransaction: async (tx) => {
      await request.writeInTransaction?.(tx);

      await writeLapsedUnpin(parts, tx, request);
    },
    readNextVersion: async (readEarlier, current) => {
      const before = await readEarlier(current);

      const until = before.row.until;

      if (
        before.row.state === 'active' &&
        (until === null || until > parts.context.gate.clock.now())
      ) {
        throw new MemoryStateError(request.target.itemID, 'restore', 'active');
      }

      return {
        change: 'restored',
        state: 'active',
        text: { ...before.text, intentQuote: null },
        evidence: parseEvidence(before.row.evidence),
        source: before.row.source,
        intentEvidence: null,
        until: null,
      };
    },
  });
}

async function writeLapsedUnpin(
  parts: StoreParts,
  tx: Transaction<unknown>,
  request: RestoreRequest,
): Promise<void> {
  const item = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['state', 'is_pinned', 'until'])
    .where('item_id', '=', request.target.itemID)
    .executeTakeFirst();

  const isLapsedPin =
    item?.state === 'active' &&
    item.is_pinned === 1 &&
    item.until !== null &&
    item.until <= parts.context.gate.clock.now();

  if (!isLapsedPin) {
    return;
  }

  await writeRecordsInTransaction(tx, parts.context.log, [
    {
      kind: 'memory.pinned',
      definitions: parts.context.definitions(),
      ...(request.provenance.thread === undefined ? {} : { thread: request.provenance.thread }),
      payload: { itemID: request.target.itemID, isPinned: false },
    },
  ]);
}
