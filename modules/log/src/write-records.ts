import type { Transaction } from 'kysely';
import { applyProjections } from './apply-projections';
import { buildEnvelopeRecord } from './build-envelope-record';
import { createRecordKey } from './create-record-key';
import { encodeErasable } from './encode-erasable';
import { MissingDefinitionsError } from './missing-definitions-error';
import type { JSONObject, Log, LogRecord, LogTables, RecordInput } from './types';
import { withWriteTransaction } from './with-write-transaction';

// The log's append API: it adds records to the end of the log, with every projection row they
// change, in one write transaction. Erasable fields are encrypted first, each record under a new
// key in the key store, so nixie.db never holds their plaintext.
export async function writeRecords(
  log: Log,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  for (const input of inputs) {
    requireDefinitions(input);
  }
  const sealed = await Promise.all(inputs.map((input) => encodeErasableFields(log, input)));

  return withWriteTransaction(log.writer, async (tx) => {
    const records: LogRecord[] = [];

    for (const [index, input] of inputs.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- each record takes the next sequence
      const record = await writeRecord(tx, log, { input, sealed: sealed[index] ?? null });

      records.push(record);
    }
    return records;
  });
}

// the type demands the field, and this check covers a caller that reached past the type, such as
// one that parsed its input or passed an empty hash
function requireDefinitions(input: RecordInput): void {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the check distrusts the type
  const hash: unknown = (input as Partial<RecordInput>).definitions?.snapshotHash;

  if (typeof hash !== 'string' || hash.length === 0) {
    throw new MissingDefinitionsError(input.kind);
  }
}

interface SealedFields {
  readonly keyID: string;
  readonly sealed: Uint8Array<ArrayBuffer>;
}

// a record with no erasable fields gets no key
async function encodeErasableFields(log: Log, input: RecordInput): Promise<SealedFields | null> {
  if (input.erasable === undefined || Object.keys(input.erasable).length === 0) {
    return null;
  }
  const recordKey = await createRecordKey(log);
  const sealed = await encodeErasable(recordKey.key, recordKey.keyID, input.erasable);

  return { keyID: recordKey.keyID, sealed };
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
    .values(buildRecordValues(pending))
    .returningAll()
    .executeTakeFirstOrThrow();
  const record = buildEnvelopeRecord(row);

  await applyProjections(tx, log.projections, record);
  return { ...record, erasable: buildWrittenErasable(pending.input.erasable, pending.sealed) };
}

function buildRecordValues(pending: PendingRecord) {
  const input = pending.input;
  const sealed = pending.sealed;

  return {
    recorded_at: Date.now(),
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
  return erasable === undefined || sealed === null
    ? { status: 'none' }
    : { status: 'readable', fields: erasable };
}
