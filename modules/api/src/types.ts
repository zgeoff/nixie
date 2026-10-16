import type { ImageMediaType } from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';
import type { RecordKind } from '@heynixie/log';
import type { HostMemoryStore } from '@heynixie/memory';
import type { TasksContext } from '@heynixie/tasks';
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins';

// The tuning values of the API, each with a default in defaultAPISettings.
export interface APISettings {
  // how long an unused enrolment code works
  readonly enrolmentCodeLifetimeMs: number;

  // how long a device session lasts without a call before it lapses
  readonly sessionIdleMs: number;

  // the least time between 2 refusal records for one external ID
  readonly refusalIntervalMs: number;

  // the least time between 2 writes of a session's last seen time
  readonly lastSeenIntervalMs: number;
}

// One image of your message, with the type its bytes hold, which readOwnerImages checked.
export interface OwnerImage {
  readonly mediaType: ImageMediaType;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

// the sequence of the record a forget removed, which the session cleanup's records name
interface ForgottenRecord {
  readonly recordSequence: number;
}

// The conversation's session cleanup. It must be safe to run again, because the start sequence runs
// it again for a forget a crash cut short.
export type CleanupRecordSessions = (cause: ForgottenRecord) => Promise<void>;

// What every API entry point needs: the tasks context, whose log holds the API's projections and
// whose clock times codes, sessions and refusals, and the tuning values.
export interface APIContext extends TasksContext {
  readonly settings: APISettings;

  // the session cleanup a record forget runs, or null before the conversation starts, when the
  // start sequence finishes the forget before any runner claims work
  readonly readSessionCleanup: () => CleanupRecordSessions | null;
}

// What the host router reaches beyond the API's context: the memory store, and the server's reset.
export interface HostRouterOptions {
  readonly context: APIContext;

  // the memory store, or null until the start sequence fills it
  readonly readMemory: ReadHostMemory;

  // resets the log and keeps the live sessions, then the server stops
  readonly runReset: () => Promise<HostReset>;
}

export type ReadHostMemory = () => HostMemoryStore | null;

// What the server reports of a finished reset: when it ran, the last sequence of the old log and
// how many device sessions it kept.
interface HostReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly keptSessions: number;
}

// What one call carries into the router: the device session's token, from the bearer header or
// the session cookie, and where it came from, so only a browser's revoke clears its cookie.
export interface APIRequestContext extends ResponseHeadersPluginContext {
  readonly sessionToken: string | undefined;
  readonly tokenSource: 'bearer' | 'cookie' | 'none';
}

// A channel identity that a call resolved to: one row of the identity record.
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
