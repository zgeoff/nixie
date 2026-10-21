import type { RecordInput } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { Lease } from '@heynixie/tasks';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { ReadableWrites } from './filter-readable-writes';
import { filterReadableWrites } from './filter-readable-writes';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import { writeAppliedVersions } from './write-applied-versions';
import { writePublishedRecords } from './write-published-records';
import type {
  BatchBounds,
  GateVerdict,
  StagedFlag,
  StagedWrite,
  WriterTables,
} from './writer-types';

export interface GatedWrite {
  readonly write: StagedWrite;
  readonly verdict: GateVerdict;
}

export interface BatchOutcome {
  readonly applied: readonly VersionRef[];
  readonly proposed: number;
  readonly forgotten: number;
  readonly flags: readonly StagedFlag[];
}

export interface BatchPublication {
  readonly lease: Lease;

  readonly clock: { readonly now: () => number };
  readonly bounds: BatchBounds;
  readonly writes: readonly GatedWrite[];

  readonly flags: readonly StagedFlag[];

  readonly buildRecords: (outcome: BatchOutcome) => readonly RecordInput[];
}

export type PublishResult =
  | ({ readonly status: 'published' } & BatchOutcome)
  | { readonly status: 'superseded' };

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
      await updateVersionIndex(parts, version.ref.itemID, version.next);
    }

    if (NIXIE_TEST_BUILD) {
      await waitAtFaultPoint('writer.publish.after', { kind: 'task', id: memoryWriterTaskID });
    }

    return { status: 'published', ...result.outcome };
  });
}

type WrittenVersions = Awaited<ReturnType<typeof writeAppliedVersions>>;

type WrittenBatch =
  | {
      readonly status: 'published';
      readonly written: WrittenVersions;
      readonly outcome: BatchOutcome;
    }
  | { readonly status: 'superseded' };

async function writeBatchInTransaction(
  parts: StoreParts,
  tx: Transaction<unknown>,
  publication: BatchPublication,
): Promise<WrittenBatch> {
  await requireLease(tx, publication.lease, publication.clock.now());

  if (!(await probePendingBatch(tx, publication.bounds))) {
    return { status: 'superseded' };
  }

  const readable = await filterReadableWrites(parts, tx, publication);

  const kept = readable.writes;

  const written = await writeAppliedVersions(parts, tx, kept);

  const outcome = buildBatchOutcome(publication, readable, written);

  await writePublishedRecords(parts, tx, { kept, records: publication.buildRecords(outcome) });

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.publish.before', { kind: 'task', id: memoryWriterTaskID });
  }

  return { status: 'published', written, outcome };
}

async function probePendingBatch(tx: Transaction<unknown>, bounds: BatchBounds): Promise<boolean> {
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

function buildBatchOutcome(
  publication: BatchPublication,
  readable: ReadableWrites,
  written: WrittenVersions,
): BatchOutcome {
  const kept = readable.writes;

  return {
    applied: written.map((version) => version.ref),
    proposed: kept.filter((gated) => gated.verdict.outcome === 'propose').length,
    forgotten: publication.writes.length - kept.length,
    flags: readable.flags,
  };
}
