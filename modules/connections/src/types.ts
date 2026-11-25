import type { CredentialRecorder } from '@heynixie/credentials';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import type { Generated, Selectable } from 'kysely';

interface OAuthClientRow {
  readonly oauth_client_id: string;
  readonly connector_id: Generated<string>;
  readonly provider_client_id: string;
  readonly key_id: string;
  readonly secret_sealed: Uint8Array<ArrayBuffer> | null;
  readonly removal_counter: Generated<number>;
  readonly created_at: number;
  readonly removed_at: number | null;
}

interface ConnectionTableRow {
  readonly connection_id: string;
  readonly short_id: string;
  readonly connector_id: Generated<string>;
  readonly oauth_client_id: string;
  readonly key_id: string;
  readonly account_sealed: Uint8Array<ArrayBuffer> | null;
  readonly token_key_id: string | null;
  readonly refresh_token_sealed: Uint8Array<ArrayBuffer> | null;
  readonly status: string;
  readonly status_reason: string | null;
  readonly status_since: number;
  readonly last_success_at: number | null;
  readonly failures: number;
  readonly retry_at: number | null;
  readonly binding: Generated<string>;
  readonly removal_counter: Generated<number>;
  readonly created_at: number;
}

interface KeyMarkRow {
  readonly key_id: string;
  readonly marked_at: number;
}

export type ConnectionRow = Selectable<ConnectionTableRow>;

export type ClientRow = Selectable<OAuthClientRow>;

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type ConnectionTables = CheckedTables<
  Readonly<{
    oauth_clients: OAuthClientRow;
    connections: ConnectionTableRow;
    key_marks: KeyMarkRow;
  }>
>;

// Seams that a test build uses to hold the backend part way through a save, so a crash test kills
// the process at a named point. A release build never passes them.
export interface BackendHooks {
  // after the last check outside the write transaction, before it opens
  readonly beforeTokenWrite?: (credentialID: string) => Promise<void>;

  // after the save commits, before the caller removes the key the save replaced
  readonly afterTokenSaved?: (credentialID: string) => Promise<void>;

  // after a refresh's new key is made and marked, before the refresh's start record commits
  readonly afterKeyCreated?: (keyID: string) => Promise<void>;
}

export interface BackendOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;

  // the credential log, which tells the sweep which refresh still names a new key
  readonly recorder: CredentialRecorder;
  readonly now: () => number;
  readonly hooks?: BackendHooks;
}
