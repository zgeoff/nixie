import type { SandboxLimits } from '@heynixie/sandbox';
import type { FetchLimits } from '@heynixie/wire';
import { defaultFetchTextBytes } from '@heynixie/wire';

export interface WebFetchConfig {
  readonly limits: FetchLimits;
  readonly sandboxLimits: SandboxLimits;
}

// The web fetch's tuning defaults: a body of 2 MiB read, 15 s for the whole call with its
// redirects, 5 redirects, and 20,000 bytes of returned text. imp starts no sandbox on a disk smaller
// than the 4096 MiB filesystem impd gives a built image.
export const webFetchDefaults: WebFetchConfig = {
  limits: {
    bodyBytes: 2_097_152,
    timeoutMs: 15_000,
    redirects: 5,
    textBytes: defaultFetchTextBytes,
  },
  sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
};
