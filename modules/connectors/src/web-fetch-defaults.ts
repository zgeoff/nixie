import { imageLimits } from '@heynixie/contract';
import type { SandboxLimits } from '@heynixie/sandbox';
import { sandboxSizes } from '@heynixie/sandbox';
import type { FetchLimits } from '@heynixie/wire';
import { defaultFetchTextBytes } from '@heynixie/wire';

export interface WebFetchConfig {
  readonly limits: FetchLimits;
  readonly sandboxLimits: SandboxLimits;
  readonly linkPathChars: number;
  readonly pageStoreBytes: number;
  readonly imageLongEdge: number;
}

export const webFetchDefaults: WebFetchConfig = {
  limits: {
    bodyBytes: 2_097_152,
    timeoutMs: 15_000,
    redirects: 5,
    textBytes: defaultFetchTextBytes,
    imageBytes: imageLimits.bytes,
  },
  sandboxLimits: sandboxSizes.fetch,
  linkPathChars: 24,
  pageStoreBytes: 20_971_520,
  imageLongEdge: imageLimits.longEdge,
};
