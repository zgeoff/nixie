import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { Clock, Lease } from '@heynixie/tasks';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { findReadableWrites } from './find-readable-writes';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import { writeAppliedVersions } from './write-applied-versions';
import { writePublishedRecords } from './write-published-records';
import type { BatchBounds, GateVerdict, StagedWrite, WriterTables } from './writer-types';

// One write of a batch with the gate's verdict on it.
export interface GatedWrite {
  readonly write: StagedWrite;
  readonly verdict: GateVerdict;
}

// What the batch kept once every source was read again: the versions it applied, and how many
// proposals it published and how many writes it left out because their source became unreadable.
export interface BatchOutcome {
  readonly applied: readonly VersionRef[];
  readonly proposed: number;
  readonly forgotten: number;
}

export interface BatchPublication {
  // the writer step's lease, which the transaction checks first
  readonly lease: Lease;

  // the task clock, which the transaction reads before it checks the lease, so a lease that
  // expired while the publish waited for the delivery lock or the transaction never publishes
  readonly clock: Pick<Clock, 'now'>;
  readonly bounds: BatchBounds;
  readonly writes: readonly GatedWrite[];

  // the batch's own records, such as the advanced cursor and the notice, built from what it kept
  readonly buildRecords: (outcome: BatchOutcome) => readonly RecordInput[];
}

export type PublishResult =
  | ({ readonly status: 'published' } & BatchOutcome)
  | { readonly status: 'superseded' };

// Publishes one writer batch in one transaction under the delivery lock: the applied versions, the
// proposals, the notices and the advanced cursor. A write whose source was forgotten never
// publishes, and a stale revision fails the whole batch, a proposed one included.
export function writeMemoryBatch(
  parts: StoreParts,
  publication: BatchPublication,
): Promise<PublishResult> {
  return parts.lock(async () => {
    const result = await withWriteTransaction(parts.context.log.writer, (tx) =>
      writeBatchInTransaction(parts, tx, publication),
    );

    if (result.status === 'superseded') {
      return result;
    }

    for (const version of result.written) {
      // oxlint-disable-next-line no-await-in-loop -- the index takes one entry at a time
      await updateVersionIndex(parts, version.ref.itemID, version.next);
    }

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('writer.publish.after', { kind: 'task', id: memoryWriterTaskID });
    }

    return { status: 'published', ...result.outcome };
  });
}

// the versions the batch applied, as the publish wrote them
type WrittenVersions = Awaited<ReturnType<typeof writeAppliedVersions>>;

type WrittenBatch =
  | {
      readonly status: 'published';
      readonly written: WrittenVersions;
      readonly outcome: BatchOutcome;
    }
  | { readonly status: 'superseded' };

// The transaction checks the step's lease and that the batch is still the one the cursor waits on,
// then reads every cited source again and leaves out each write whose source is gone. A kept
// proposal whose item moved on fails the batch, so every proposal it publishes can be approved.
async function writeBatchInTransaction(
  parts: StoreParts,
  tx: Transaction<unknown>,
  publication: BatchPublication,
): Promise<WrittenBatch> {
  await requireLease(tx, publication.lease, publication.clock.now());

  if (!(await isPendingBatch(tx, publication.bounds))) {
    return { status: 'superseded' };
  }

  const kept = await findReadableWrites(parts, tx, publication.writes);
  const written = await writeAppliedVersions(parts, tx, kept);

  const outcome = buildBatchOutcome(publication, kept, written);

  await writePublishedRecords(parts, tx, { kept, records: publication.buildRecords(outcome) });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.publish.before', { kind: 'task', id: memoryWriterTaskID });
  }

  return { status: 'published', written, outcome };
}

function buildBatchOutcome(
  publication: BatchPublication,
  kept: readonly GatedWrite[],
  written: WrittenVersions,
): BatchOutcome {
  return {
    applied: written.map((version) => version.ref),
    proposed: kept.filter((gated) => gated.verdict.outcome === 'propose').length,
    forgotten: publication.writes.length - kept.length,
  };
}

// the batch is still the one the cursor waits on, so a rerun after a commit that a crash hid
// publishes nothing twice
async function isPendingBatch(tx: Transaction<unknown>, bounds: BatchBounds): Promise<boolean> {
  const row = await tx
    .$extendTables<WriterTables>()
    .selectFrom('memory_writer')
    .select(['cursor', 'pending_start', 'pending_end'])
    .where('writer_id', '=', memoryWriterTaskID)
    .executeTakeFirst();

  return (
    row !== undefined &&
    row.cursor === bounds.start &&
    row.pending_start === bounds.start &&
    row.pending_end === bounds.end
  );
}
