import type { Transaction } from 'kysely';
import { applyProjections } from './apply-projections';
import { buildEnvelopeRecord } from './build-envelope-record';
import { createRecordKey } from './create-record-key';
import { encodeAttachment } from './encode-attachment';
import { encodeErasable } from './encode-erasable';
import { MissingDefinitionsError } from './missing-definitions-error';
import type { JSONObject, Log, LogRecord, LogTables, RecordInput } from './types';

// Appends records inside a write transaction that the caller opened with withWriteTransaction, so a
// module's own rows and the records that describe them commit together. Each record's erasable
// fields and attachments are encrypted under a new key, committed to the key store first.
export async function writeRecordsInTransaction(
  tx: Transaction<unknown>,
  log: Log,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  for (const input of inputs) {
    requireDefinitions(input);
  }

  const sealed = await Promise.all(inputs.map((input) => encodeErasableFields(log, input)));

  const records: LogRecord[] = [];

  for (const [index, input] of inputs.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- each record takes the next sequence
    const record = await writeRecord(tx, log, { input, sealed: sealed[index] ?? null });

    records.push(record);
  }

  return records;
}

// the type demands the field, and this check covers a caller that reached past the type, such as
// one that parsed its input or passed an empty hash
function requireDefinitions(input: RecordInput): void {
  const hash: unknown = (input as Partial<RecordInput>).definitions?.snapshotHash;

  if (typeof hash !== 'string' || hash.length === 0) {
    throw new MissingDefinitionsError(input.kind);
  }
}

interface SealedFields {
  readonly keyID: string;
  readonly sealed: Uint8Array<ArrayBuffer>;
  readonly attachments: readonly Uint8Array<ArrayBuffer>[];
}

// a record with no erasable fields and no attachments gets no key
async function encodeErasableFields(log: Log, input: RecordInput): Promise<SealedFields | null> {
  const attachments = input.attachments ?? [];

  if (
    attachments.length === 0 &&
    (input.erasable === undefined || Object.keys(input.erasable).length === 0)
  ) {
    return null;
  }

  const recordKey = await createRecordKey(log);
  const sealed = await encodeErasable(recordKey.key, recordKey.keyID, input.erasable ?? {});

  const sealedAttachments = await Promise.all(
    attachments.map((bytes, position) =>
      encodeAttachment(recordKey.key, recordKey.keyID, { position, bytes }),
    ),
  );

  return { keyID: recordKey.keyID, sealed, attachments: sealedAttachments };
}

interface PendingRecord {
  readonly input: RecordInput;
  readonly sealed: SealedFields | null;
}

async function writeRecord(
  tx: Transaction<unknown>,
  log: Log,
  pending: PendingRecord,
): Promise<LogRecord> {
  const row = await tx
    .$extendTables<LogTables>()
    .insertInto('records')
    .values(buildRecordValues(pending, log.writer.clock.now()))
    .returningAll()
    .executeTakeFirstOrThrow();

  const record = buildEnvelopeRecord(row);

  await writeAttachments(tx, record.sequence, pending.sealed?.attachments ?? []);
  await applyProjections(tx, log.projections, record);

  return { ...record, erasable: buildWrittenErasable(pending.input.erasable, pending.sealed) };
}

async function writeAttachments(
  tx: Transaction<unknown>,
  sequence: number,
  attachments: readonly Uint8Array<ArrayBuffer>[],
): Promise<void> {
  if (attachments.length === 0) {
    return;
  }

  await tx
    .$extendTables<LogTables>()
    .insertInto('record_attachments')
    .values(attachments.map((sealed, position) => ({ sequence, position, sealed })))
    .execute();
}

function buildRecordValues(pending: PendingRecord, recordedAt: number) {
  const input = pending.input;
  const sealed = pending.sealed;

  return {
    recorded_at: recordedAt,
    kind: input.kind,
    thread: input.thread ?? null,
    step_key: input.stepKey ?? null,
    parent: input.parent ?? null,
    content_source: input.contentSource ?? null,
    decision: input.decision === undefined ? null : JSON.stringify(input.decision),
    prompt_cause: input.promptCause ?? null,
    snapshot_hash: input.definitions.snapshotHash,
    persona_version: input.definitions.personaVersion ?? null,
    job_version: input.definitions.jobVersion ?? null,
    proposal_id: input.approval?.proposalID ?? null,
    approval_id: input.approval?.approvalID ?? null,
    action_hash: input.approval?.actionHash ?? null,
    payload: JSON.stringify(input.payload ?? {}),
    key_id: sealed?.keyID ?? null,
    sealed: sealed?.sealed ?? null,
  };
}

function buildWrittenErasable(
  erasable: JSONObject | undefined,
  sealed: SealedFields | null,
): LogRecord['erasable'] {
  return sealed === null ? { status: 'none' } : { status: 'readable', fields: erasable ?? {} };
}
