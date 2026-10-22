import type { ImageMediaType } from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';
import type { RecordKind } from '@heynixie/log';
import type { HostMemoryStore, MemoryProposals, MemoryStore } from '@heynixie/memory';
import type { TasksContext } from '@heynixie/tasks';
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins';

export interface APISettings {
  readonly enrolmentCodeLifetimeMs: number;

  readonly sessionIdleMs: number;

  readonly refusalIntervalMs: number;

  readonly lastSeenIntervalMs: number;
}

export interface OwnerImage {
  readonly mediaType: ImageMediaType;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

interface ForgottenRecord {
  readonly recordSequence: number;
}

// The start sequence runs the cleanup again for a forget that a crash cut short, so the cleanup must
// be safe to rerun.
export type CleanupRecordSessions = (cause: ForgottenRecord) => Promise<void>;

export interface APIContext extends TasksContext {
  readonly settings: APISettings;

  readonly readSessionCleanup: () => CleanupRecordSessions | null;
}

export interface HostRouterOptions {
  readonly context: APIContext;

  readonly readMemory: ReadHostMemory;

  readonly runReset: () => Promise<HostReset>;

  readonly seedWrittenSkills: () => Promise<void>;
}

export type ReadHostMemory = () => HostMemoryStore | null;

export type ViewMemoryStore = Pick<
  MemoryStore,
  | 'view'
  | 'retire'
  | 'restore'
  | 'undo'
  | 'keep'
  | 'pin'
  | 'forget'
  | 'finishForget'
  | 'forgetRetired'
  | 'finishForgets'
> & {
  readonly proposals: Pick<MemoryProposals, 'approve' | 'reject'>;
};

export type ReadViewMemory = () => ViewMemoryStore | null;

interface HostReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly keptSessions: number;
}

export interface APIRequestContext extends ResponseHeadersPluginContext {
  readonly sessionToken: string | undefined;
  readonly tokenSource: 'bearer' | 'cookie' | 'none';
}

export interface Identity {
  readonly identityID: string;
  readonly channel: string;
  readonly label: string;
  readonly pairedAt: number;
  readonly lastSeenAt: number;
}

interface IdentityRow {
  readonly identity_id: string;
  readonly channel: string;
  readonly external_id: string;
  readonly label: string;
  readonly token_hash: string | null;
  readonly paired_at: number;
  readonly last_seen_at: number;
  readonly revoked_at: number | null;
  readonly paired_sequence: number;
}

interface EnrolmentCodeRow {
  readonly code_hash: string;
  readonly issued_at: number;
  readonly expires_at: number;
  readonly issued_by: string | null;
  readonly used_at: number | null;
  readonly identity_id: string | null;
}

interface ClientActionRow {
  readonly client_action_id: string;
  readonly procedure: string;
  readonly identity_id: string | null;
  readonly input_hash: string | null;
  readonly result: string;
  readonly recorded_at: number;
}

interface RefusalRow {
  readonly refusal_key: string;
  readonly refused_at: number;
  readonly refused_sequence: number;
}

interface TaskRow {
  readonly task_id: string;
  readonly state: string;
}

interface RecordRow {
  readonly sequence: number;
  readonly thread: string | null;
  readonly kind: RecordKind;
  readonly recorded_at: number;
  readonly payload: string;
  readonly key_id: string | null;
}

interface ThreadRow {
  readonly thread: string;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type APITables = CheckedTables<
  Readonly<{
    identities: IdentityRow;
    enrolment_codes: EnrolmentCodeRow;
    client_actions: ClientActionRow;
    refusals: RefusalRow;
    tasks: TaskRow;
    records: RecordRow;
    threads: ThreadRow;
  }>,
  'tasks' | 'records' | 'threads'
>;
