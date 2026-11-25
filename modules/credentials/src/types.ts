import type { z } from 'zod';
import type { secretsSchema } from './file/secrets-schema';

export type SecretsFile = z.infer<typeof secretsSchema>;

export type FileGroup = 'model_credentials' | 'connector_credentials' | 'settings';

export interface FileCredentialRef {
  readonly backend: 'file';
  readonly group: FileGroup;
  readonly name: string;
}

export type CredentialRef = FileCredentialRef;

export interface CredentialQuery {
  readonly class: 'model' | 'connector' | 'setting';

  // a deploymentReference, such as deployment:kagi
  readonly reference: string;

  // the config key that holds the reference, which a missing entry's error names
  readonly configKey?: string;
}

export type ResolveCredential = (query: CredentialQuery) => CredentialRef | null;

type Backend = CredentialRef['backend'];

export interface BindingRef {
  // a UUID
  readonly bindingID: string;
  readonly backend: Backend;
}

export interface CredentialSpec {
  readonly kind: 'static' | 'model';

  // such as 'Kagi'
  readonly label: string;

  // where the value may go: https, except the deployment's own service
  readonly origins: readonly string[];

  // a static value goes in Authorization as Bearer when this is left out
  readonly placement?:
    | { readonly header: string; readonly scheme?: 'Bearer' }
    | { readonly basic: { readonly user: string } }
    | { readonly path: true };
}

export interface FetchOptions {
  // 'same_origin' by default
  readonly redirects?: 'same_origin' | 'none';

  // the deployment's own service, such as the spend gateway: http and a private address pass
  readonly deploymentService?: true;
}

export type CredentialFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GrantRequest {
  readonly profileID: string;
  readonly header: 'bearer' | 'x-api-key';
  readonly host: string;
}
