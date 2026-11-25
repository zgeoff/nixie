import type { z } from 'zod';
import type { secretsSchema } from './file/secrets-schema';

export type SecretsFile = z.infer<typeof secretsSchema>;

export type FileGroup = 'model_credentials' | 'connector_credentials' | 'settings';

export interface FileCredentialRef {
  readonly backend: 'file';
  readonly group: FileGroup;
  readonly name: string;
}

export interface DatabaseCredentialRef {
  readonly backend: 'database';

  // a UUID: a connection, an OAuth client or a consent
  readonly credentialID: string;
}

export type CredentialRef = FileCredentialRef | DatabaseCredentialRef;

export interface CredentialQuery {
  readonly class: 'model' | 'connector' | 'setting';

  // a deploymentReference, such as deployment:kagi
  readonly reference: string;

  // the config key that holds the reference, which a missing entry's error names
  readonly configKey?: string;
}

export type ResolveCredential = (query: CredentialQuery) => FileCredentialRef | null;

type Backend = CredentialRef['backend'];

export interface BindingRef<B extends Backend = Backend> {
  // a UUID
  readonly bindingID: string;
  readonly backend: B;

  // the reference's removal counter when the binding was made: after a removal advances it, every
  // handle that carries an older value refuses
  readonly removalCounter: number;
}

// Where an OAuth provider takes requests, and who it says it is.
export interface OAuthProvider {
  readonly tokenURL: string;
  readonly revokeURL?: string;

  // where the owner consents; no request of a connection's fetcher may reach its host
  readonly authorizeURL?: string;

  // the `iss` of the provider's ID tokens
  readonly issuer: string;

  // the OAuth client's public ID, which is the `aud` of its ID tokens
  readonly clientID: string;

  // The protected resource that every token request names, as RFC 8707 sets, such as an MCP
  // server's URL.
  readonly resource?: string;
}

export interface CredentialSpec {
  readonly kind: 'static' | 'model' | 'oauth_client' | 'oauth_token';

  // such as 'Kagi'
  readonly label: string;

  // where the value may go: https, except the deployment's own service
  readonly origins: readonly string[];

  // a static value goes in Authorization as Bearer when this is left out
  readonly placement?:
    | { readonly header: string; readonly scheme?: 'Bearer' }
    | { readonly basic: { readonly user: string } }
    | { readonly path: true };

  // an OAuth client or token names its provider, whose origins the spec must hold
  readonly provider?: OAuthProvider;
}

export interface FetchOptions {
  // 'same_origin' by default
  readonly redirects?: 'same_origin' | 'none';

  // the deployment's own service, such as the spend gateway: http and a private address pass
  readonly deploymentService?: true;

  // A host on a private network: a hop to this host passes when its resolved address falls in the
  // range, and every other host still needs a public address.
  readonly pairing?: { readonly host: string; readonly range: string };

  // The response may be a server-sent event stream. The fetcher then removes the value from each
  // event as it arrives, and never buffers the whole body.
  readonly stream?: true;
}

export type CredentialFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GrantRequest {
  readonly profileID: string;
  readonly header: 'bearer' | 'x-api-key';
  readonly host: string;
}
