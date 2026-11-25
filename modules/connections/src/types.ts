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
  readonly short_id: string | null;
  readonly origin: string | null;
  readonly redirect_uri: string | null;
  readonly picker_key: string | null;
  readonly project_number: string | null;
  readonly secret_fingerprint: string | null;
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
  readonly label_sealed: Uint8Array<ArrayBuffer> | null;

  // JSON arrays of short scope names, and of MissingScope
  readonly granted_scopes: Generated<string>;
  readonly missing_scopes: Generated<string>;
  readonly refresh_expires_at: number | null;
  readonly token_fingerprint: string | null;
}

interface ConsentRequestRow {
  readonly consent_id: string;

  // SHA-256 of the state, which is never stored
  readonly state_hash: string;
  readonly device_session_id: string;
  readonly oauth_client_id: string;
  readonly connection_id: string | null;
  readonly key_id: string;
  readonly verifier_sealed: Uint8Array<ArrayBuffer>;
  readonly claimed_at: number | null;
  readonly created_at: number;
  readonly expires_at: number;
}

interface KeyMarkRow {
  readonly key_id: string;
  readonly marked_at: number;
}

export type ConnectionRow = Selectable<ConnectionTableRow>;

export type ConsentRow = Selectable<ConsentRequestRow>;

export type ClientRow = Selectable<OAuthClientRow>;

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type ConnectionTables = CheckedTables<
  Readonly<{
    oauth_clients: OAuthClientRow;
    connections: ConnectionTableRow;
    consent_requests: ConsentRequestRow;
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
