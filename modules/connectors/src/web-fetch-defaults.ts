import type { SandboxLimits } from '@heynixie/sandbox';
import type { FetchLimits } from '@heynixie/wire';

export interface WebFetchConfig {
  readonly limits: FetchLimits;

  // the fetches one fetch sandbox serves before nixie replaces it
  readonly fetchesPerSandbox: number;
  readonly sandboxLimits: SandboxLimits;
}

// The web fetch's tuning defaults: a body of 2 MiB read, 15 s for the whole call with its
// redirects, 5 redirects, 256 KiB of returned text, and a new fetch sandbox after 50 fetches. imp
// starts no sandbox on a disk smaller than the 4096 MiB filesystem impd gives a built image.
export const webFetchDefaults: WebFetchConfig = {
  limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
  fetchesPerSandbox: 50,
  sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
};
