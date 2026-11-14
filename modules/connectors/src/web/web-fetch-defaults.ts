import { imageLimits } from '@heynixie/contract';
import type { SandboxLimits } from '@heynixie/sandbox';
import type { FetchLimits } from '@heynixie/wire';
import { defaultFetchTextBytes } from '@heynixie/wire';
import type { SecretsEntryName } from './secrets-entry-names';

export interface WebFetchConfig {
  readonly limits: FetchLimits;
  readonly sandboxLimits: SandboxLimits;
  readonly linkPathChars: number;
  readonly pageStoreBytes: number;
  readonly imageLongEdge: number;
  readonly backoff: {
    readonly backoffMs: number;
    readonly backoffCapMs: number;
    readonly backoffWaitMs: number;
  };

  // whether a typed URL's exemption from the secret scan covers its redirects too
  readonly secretTypedURLCovers: 'named_url' | 'redirects';

  // the entries of the secrets file whose values the scan matches exactly
  readonly secretOwnValues: readonly SecretsEntryName[];
  readonly secretOwnValueMinChars: number;
}

export const webFetchDefaults: WebFetchConfig = {
  limits: {
    bodyBytes: 2_097_152,
    timeoutMs: 15_000,
    redirects: 5,
    textBytes: defaultFetchTextBytes,
    imageBytes: imageLimits.bytes,
  },
  sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
  linkPathChars: 24,
  pageStoreBytes: 20_971_520,
  imageLongEdge: imageLimits.longEdge,
  backoff: { backoffMs: 30_000, backoffCapMs: 300_000, backoffWaitMs: 5000 },
  secretTypedURLCovers: 'redirects',
  secretOwnValues: [
    'deployment_key',
    'impd_token',
    'definitions_export_token',
    'model_credentials',
    'connector_credentials',
  ],
  secretOwnValueMinChars: 8,
};
