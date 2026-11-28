import { mcpSignInStatePrefix } from '@heynixie/contract';
import type { CredentialStore, HeldBackend } from '@heynixie/credentials';
import { TokenRequestError } from '@heynixie/credentials';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { mcpServerChangedCodec } from '../record/mcp-server-changed-codec';
import { readServerRow } from '../rows/read-server-rows';
import { toCredentialFields } from '../rows/to-credential-fields';
import { toFactsInUse } from '../rows/to-facts-in-use';
import { toRequestedFacts } from '../rows/to-requested-facts';
import type { McpContext } from '../types';
import { buildPKCE } from './build-pkce';
import { readBindings, toBinding } from './read-bindings';
import type { BindingsRuntime, ServerBindings } from './read-bindings';

export type ConnectResult =
  | { readonly status: 'ok'; readonly authorizeURL: string }
  | { readonly status: 'unknown_server' }
  | { readonly status: 'not_added' }
  | { readonly status: 'invalid_origin' }
  | { readonly status: 'discovery_failed'; readonly reason: string };

export interface FinishInput {
  readonly state: string;
  readonly code: string | null;
  readonly error: string | null;
  readonly iss: string | null;
}

export type FinishResult =
  | { readonly status: 'ok'; readonly server: string }
  | { readonly status: 'unknown_state' }
  | { readonly status: 'refused' }
  | { readonly status: 'issuer_mismatch' }
  | { readonly status: 'exchange_failed'; readonly code: string };

export interface SignIn {
  readonly connect: (serverID: string, origin: string) => Promise<ConnectResult>;
  readonly finish: (input: FinishInput) => Promise<FinishResult>;
}

export interface SignInOptions {
  readonly context: McpContext;
  readonly store: CredentialStore;
  readonly backend: Pick<HeldBackend, 'writeClient'>;
  readonly runtime: BindingsRuntime;
  readonly logger: Logger;

  // runs once the grant is saved, so the proxy lists the server's tools
  readonly onSignedIn: (serverID: string) => Promise<void>;
  readonly lifetimeMs?: number;
}

interface PendingSignIn {
  readonly serverID: string;
  readonly verifier: string;
  readonly redirectURI: string;
  readonly bindings: ServerBindings;
  readonly expiresAtMs: number;
}

// The state of every sign-in starts with this, so the shared OAuth return route knows whose it is.
export const signInStatePrefix = mcpSignInStatePrefix;

// The OAuth return route that Google's consent uses too, where the web client receives the browser
// that the authorization server sends back.
export const signInReturnPath = '/connections/google/return';
const defaultLifetimeMs = 10 * 60 * 1000;

// Connect starts the OAuth sign-in of one server, and the return route finishes it. The PKCE
// verifier waits in memory under the random state, because a restart in the middle of a sign-in
// only costs the owner another press of Connect. No token passes through this file.
export function createSignIn(options: SignInOptions): SignIn {
  const pending = new Map<string, PendingSignIn>();

  const lifetimeMs = options.lifetimeMs ?? defaultLifetimeMs;

  return {
    connect: async (serverID, origin) => {
      if (!isOrigin(origin)) {
        return { status: 'invalid_origin' };
      }

      const redirectURI = `${origin}${signInReturnPath}`;

      const server = await readServerRow(options.context.log.writer.db, serverID);

      if (server === null || server.state === 'removed') {
        return { status: 'unknown_server' };
      }

      if (server.state !== 'added') {
        return { status: 'not_added' };
      }

      const bound = await readBindings(options.runtime, server);

      if (bound.kind === 'failed') {
        // The reason can name the host and the address it resolved to, so the line holds neither.
        options.logger('mcp.sign_in_discovery_failed', { serverID }, 'warn');

        return { status: 'discovery_failed', reason: bound.reason };
      }

      const bindings = bound.bindings;

      await options.backend.writeClient(bindings.clientCredentialID, {
        clientID: bindings.facts.clientID,
        clientSecret: '',
        connectorID: 'mcp',
      });

      const pkce = buildPKCE();
      const state = `${signInStatePrefix}${crypto.randomUUID()}`;

      pending.set(state, {
        serverID,
        verifier: pkce.verifier,
        redirectURI,
        bindings,
        expiresAtMs: options.context.now() + lifetimeMs,
      });

      const authorize = new URL(bindings.discovered.authorizeURL);

      authorize.search = new URLSearchParams({
        response_type: 'code',
        client_id: bindings.facts.clientID,
        redirect_uri: redirectURI,
        scope: bindings.facts.scope,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state,
        resource: bindings.facts.url,
      }).toString();

      return { status: 'ok', authorizeURL: authorize.href };
    },
    finish: async (input) => {
      const found = pending.get(input.state);

      pending.delete(input.state);

      if (found === undefined || found.expiresAtMs <= options.context.now()) {
        return { status: 'unknown_state' };
      }

      if (input.error !== null || input.code === null) {
        return { status: 'refused' };
      }

      const bindings = found.bindings;

      // RFC 9207: the return names the issuer, and the issuer is the one that discovery found
      if (input.iss !== bindings.discovered.issuer) {
        return { status: 'issuer_mismatch' };
      }

      try {
        await options.store.exchange(bindings.client, {
          code: input.code,
          redirectURI: found.redirectURI,
          codeVerifier: found.verifier,
          credentialID: bindings.grantCredentialID,
        });
      } catch (error) {
        return {
          status: 'exchange_failed',
          code: error instanceof TokenRequestError ? error.code : 'request_failed',
        };
      }

      await writeSignedIn(options.context, found.serverID, bindings);

      await options.onSignedIn(found.serverID);

      return { status: 'ok', server: found.serverID };
    },
  };
}

// An https origin with no path, query or user name: the page that sent it. A test build also takes
// http, for the stand-in server.
function isOrigin(text: string): boolean {
  if (!URL.canParse(text)) {
    return false;
  }

  const url = new URL(text);

  const isSecure = url.protocol === 'https:' || (NIXIE_TEST_BUILD && url.protocol === 'http:');

  return isSecure && url.origin === text && url.username === '' && url.password === '';
}

// Records where the grant was signed in, so a later discovery that names another authorization
// server stops at a new sign-in.
async function writeSignedIn(
  context: McpContext,
  serverID: string,
  bindings: ServerBindings,
): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const row = await readServerRow(tx, serverID);

    if (row?.state !== 'added') {
      return;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpServerChangedCodec.kind,
        definitions: context.definitions(),
        payload: mcpServerChangedCodec.encode({
          serverID,
          cause: 'signed_in',
          state: row.state,
          facts: toFactsInUse(row),
          requested: toRequestedFacts(row),
          proposalID: row.proposal_id,
          ...toCredentialFields(row),
          grantBinding: toBinding(bindings.discovered),
        }),
      },
    ]);
  });
}
