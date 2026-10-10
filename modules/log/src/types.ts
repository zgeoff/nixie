import type { MigrationReport } from '@heynixie/db';
import type { Generated, Kysely, Selectable, Transaction } from 'kysely';

// The one process that writes the database, from start until stop.
export interface Writer {
  // the volume's mount root, which holds nixie.db and keys.db
  readonly dataDir: string;
  readonly db: Kysely<unknown>;

  // keys.db, the key store that holds every record key wrapped by the deployment key
  readonly keys: Kysely<unknown>;
  readonly epoch: number;
  readonly migration: MigrationReport;
  readonly stop: () => Promise<void>;
}

// The exclusive flock on the data directory, held until release or until the process dies.
export interface WriterLock {
  readonly release: () => void;
}

// The part of statfs that tells a local filesystem from a network one.
export type ReadFilesystemType = (path: string) => { readonly type: number };

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | readonly JSONValue[]
  | { readonly [key: string]: JSONValue };

export type JSONObject = Readonly<Record<string, JSONValue>>;

// Your words, your own data, or untrusted content.
export type ContentSource = 'owner' | 'owner_data' | 'untrusted';

// The 6 prompt causes, one on every record that prompts you.
export type PromptCause =
  | 'direct_request'
  | 'repeat'
  | 'outside_steering'
  | 'always_ask'
  | 'ask_rule'
  | 'no_rule';

// The decision point's verdict on a tool call, which the record of that call carries. The snapshot
// hash of the definitions in force sits in the record's definitions field.
export interface Decision {
  readonly outcome: 'allow' | 'ask' | 'deny';
  readonly stage: number;
  readonly rule: { readonly id: string; readonly revision: number } | null;

  // stage 5: each destination and the permission that covered it, or null for none
  readonly destinations?: readonly {
    readonly destination: string;
    readonly permission: string | null;
  }[];

  // consent: the record of your message and the checker's verdict
  readonly consent?: { readonly messageSequence: number; readonly verdict: string };
  readonly autoMode?: {
    readonly verdict: string;
    readonly reason: string;
    readonly inputsHash: string;
  };
}

// The snapshot hash of the definitions in force, and the persona and job versions the task pins.
export interface Definitions {
  readonly snapshotHash: string;
  readonly personaVersion?: string;
  readonly jobVersion?: string;
}

export interface Approval {
  readonly proposalID: string;
  readonly approvalID: string;
  readonly actionHash: string;
}

// What a caller appends. The payload holds only structured data: IDs, counts, hashes and states.
// Every free-text field goes in erasable, which nixie encrypts under a key of its own.
export interface RecordInput {
  readonly kind: string;
  readonly definitions: Definitions;
  readonly thread?: string;
  readonly stepKey?: string;
  readonly parent?: number;
  readonly contentSource?: ContentSource;
  readonly decision?: Decision;
  readonly promptCause?: PromptCause;
  readonly approval?: Approval;
  readonly payload?: JSONObject;
  readonly erasable?: JSONObject;
}

// A record as the log holds it, without its erasable fields. A projection folds this shape, so a
// rebuild after a forget gives the same rows as the live fold did.
export interface EnvelopeRecord {
  readonly sequence: number;
  readonly recordedAt: Date;
  readonly kind: string;
  readonly definitions: Definitions;
  readonly thread: string | null;
  readonly stepKey: string | null;
  readonly parent: number | null;
  readonly contentSource: ContentSource | null;
  readonly decision: Decision | null;
  readonly promptCause: PromptCause | null;
  readonly approval: Approval | null;
  readonly payload: JSONObject;
}

// none: the record had no erasable fields. shredded: its key is gone, so a gap stands where they
// were. readable: the key decrypted them.
export type ErasableFields =
  | { readonly status: 'none' }
  | { readonly status: 'shredded' }
  | { readonly status: 'readable'; readonly fields: JSONObject };

export interface LogRecord extends EnvelopeRecord {
  readonly erasable: ErasableFields;
}

// A row a record changed, as it stood after that record, or null when the record removed it.
export interface ProjectionChange {
  readonly projection: string;
  readonly key: string;
  readonly row: JSONObject | null;
}

// A record and the projection rows its transaction changed, which a reader applies together.
export interface RecordWithChanges {
  readonly record: LogRecord;
  readonly changes: readonly ProjectionChange[];
}

// A table that answers a question the log answers too slowly. fold applies one record to the
// table and returns the key of every row it changed. It reads only the envelope and the plain
// payload, so a drop and a fold from the first record rebuild the table.
export interface Projection {
  readonly table: string;
  readonly keyColumn: string;
  readonly fold: (tx: Transaction<unknown>, record: EnvelopeRecord) => Promise<readonly string[]>;
}

// What appending and reading need: the writer, the deployment key that wraps every record key,
// and the projections each append updates.
export interface Log {
  readonly writer: Pick<Writer, 'dataDir' | 'db' | 'epoch' | 'keys'>;
  readonly deploymentKey: CryptoKey;
  readonly projections: readonly Projection[];
}

// The rows of the log's own tables, as SQLite returns them.
interface RecordTable {
  readonly sequence: Generated<number>;
  readonly recorded_at: number;
  readonly kind: string;
  readonly thread: string | null;
  readonly step_key: string | null;
  readonly parent: number | null;
  readonly content_source: ContentSource | null;
  readonly decision: string | null;
  readonly prompt_cause: PromptCause | null;
  readonly snapshot_hash: string;
  readonly persona_version: string | null;
  readonly job_version: string | null;
  readonly proposal_id: string | null;
  readonly approval_id: string | null;
  readonly action_hash: string | null;
  readonly payload: string;
  readonly key_id: string | null;
  readonly sealed: Uint8Array<ArrayBuffer> | null;
}

export type RecordRow = Selectable<RecordTable>;

interface ThreadRow {
  readonly thread: string;
  readonly first_sequence: number;
  readonly last_sequence: number;
  readonly record_count: number;
  readonly last_recorded_at: number;
}

interface ProjectionChangeRow {
  readonly sequence: number;
  readonly projection: string;
  readonly row_key: string;
  readonly row: string | null;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type LogTables = Readonly<{
  records: RecordTable;
  threads: ThreadRow;
  projection_changes: ProjectionChangeRow;
}>;

export type KeyStoreTables = Readonly<{
  record_keys: { readonly key_id: string; readonly wrapped: Uint8Array<ArrayBuffer> };
}>;
