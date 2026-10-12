import type { RecordInput } from '@heynixie/log';
import { findRecordKeys, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Lease } from '@heynixie/tasks';
import { requireLease, waitAtFaultPoint } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import { memoryWriterTaskID } from './memory-writer-task-id';
import { planRememberedVersion } from './plan-remembered-version';
import { planRetiredVersion } from './plan-retired-version';
import type { Provenance, StoreParts, VersionRef } from './types';
import { updateVersionIndex } from './update-version-index';
import type { VersionPlan, WrittenVersion } from './write-version-in-transaction';
import { writeVersionInTransaction } from './write-version-in-transaction';
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
  readonly now: number;
  readonly bounds: BatchBounds;
  readonly writes: readonly GatedWrite[];

  // the batch's own records, such as the advanced cursor and the notice, built from what it kept
  readonly buildRecords: (outcome: BatchOutcome) => readonly RecordInput[];
}

export type PublishResult =
  | ({ readonly status: 'published' } & BatchOutcome)
  | { readonly status: 'superseded' };

// Publishes one writer batch in one transaction under the delivery lock: the applied versions, the
// proposals, the notices and the advanced cursor. A write whose source became unreadable during
// extraction never publishes, and a stale revision fails the whole batch.
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

type WrittenBatch =
  | {
      readonly status: 'published';
      readonly written: readonly WrittenVersion[];
      readonly outcome: BatchOutcome;
    }
  | { readonly status: 'superseded' };

// The transaction checks the step's lease and that the batch is still the one the cursor waits on,
// then reads every cited source again and leaves out each write whose source is gone.
async function writeBatchInTransaction(
  parts: StoreParts,
  tx: Transaction<unknown>,
  publication: BatchPublication,
): Promise<WrittenBatch> {
  await requireLease(tx, publication.lease, publication.now);
  if (!(await isPendingBatch(tx, publication.bounds))) {
    return { status: 'superseded' };
  }
  const kept = await findReadableWrites(parts, tx, publication.writes);
  const written = await writeAppliedVersions(parts, tx, kept);
  const outcome = buildBatchOutcome(publication, kept, written);

  await writeRecordsInTransaction(tx, parts.context.log, [
    ...kept.flatMap((gated) => (gated.verdict.outcome === 'propose' ? gated.verdict.records : [])),
    ...publication.buildRecords(outcome),
  ]);
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('writer.publish.before', { kind: 'task', id: memoryWriterTaskID });
  }
  return { status: 'published', written, outcome };
}

// the writes whose cited source is still readable
async function findReadableWrites(
  parts: StoreParts,
  tx: Transaction<unknown>,
  writes: readonly GatedWrite[],
): Promise<readonly GatedWrite[]> {
  const readable = await readReadableSources(parts, tx, writes);

  return writes.filter((gated) => readable.has(gated.write.sourceSequence));
}

function buildBatchOutcome(
  publication: BatchPublication,
  kept: readonly GatedWrite[],
  written: readonly WrittenVersion[],
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

interface SourceRow {
  readonly sequence: number;
  readonly key_id: string | null;
}

// Every cited source whose erasable fields still decrypt. A forget of a message deletes its key, so
// the source reads as gone here. The key store is a separate database, so a key deleted after this
// read and before the commit still publishes; no message forget exists yet to race it.
async function readReadableSources(
  parts: StoreParts,
  tx: Transaction<unknown>,
  writes: readonly GatedWrite[],
): Promise<ReadonlySet<number>> {
  const sequences = [...new Set(writes.map((gated) => gated.write.sourceSequence))];

  if (sequences.length === 0) {
    return new Set();
  }
  const rows: readonly SourceRow[] = await tx
    .$extendTables<{ records: SourceRow }>()
    .selectFrom('records')
    .select(['sequence', 'key_id'])
    .where('sequence', 'in', sequences)
    .execute();
  const keys = await findRecordKeys(
    parts.context.log,
    rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id])),
  );

  return new Set(
    rows
      .filter((row) => row.key_id !== null && (keys.get(row.key_id) ?? null) !== null)
      .map((row) => row.sequence),
  );
}

async function writeAppliedVersions(
  parts: StoreParts,
  tx: Transaction<unknown>,
  kept: readonly GatedWrite[],
): Promise<readonly WrittenVersion[]> {
  const written: WrittenVersion[] = [];

  for (const gated of kept) {
    if (gated.verdict.outcome === 'apply') {
      // oxlint-disable-next-line no-await-in-loop -- each version reads the rows the one before wrote
      const version = await writeVersionInTransaction(
        parts,
        tx,
        planBatchVersion(gated.write, gated.verdict),
      );

      written.push(version);
      if (NIXIE_TEST_BUILD && written.length === 1) {
        // oxlint-disable-next-line no-await-in-loop -- the harness holds the first write only
        await waitAtFaultPoint('writer.publish.inside', { kind: 'task', id: memoryWriterTaskID });
      }
    }
  }
  return written;
}

// The version an applied write adds. Its provenance names the writer and takes its source, checks
// and evidence from the gate, never from the model.
function planBatchVersion(
  write: StagedWrite,
  verdict: Extract<GateVerdict, { readonly outcome: 'apply' }>,
): VersionPlan {
  const provenance: Provenance = {
    origin: 'memory_writer',
    source: verdict.source,
    taskID: memoryWriterTaskID,
    proposalID: null,
    checks: verdict.checks,
    thread: memoryWriterTaskID,
  };

  if (write.op === 'retire') {
    return planRetiredVersion({
      target: write.target,
      provenance,
      intentQuote: write.quote,
      intentEvidence: verdict.evidence,
    });
  }
  return planRememberedVersion({
    text: write.text,
    provenance,
    evidenceQuote: write.quote,
    evidence: verdict.evidence,
    ...(write.target === null ? {} : { target: write.target }),
  });
}
