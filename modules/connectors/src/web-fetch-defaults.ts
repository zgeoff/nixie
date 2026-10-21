import type { SandboxLimits } from '@heynixie/sandbox';
import type { FetchLimits } from '@heynixie/wire';
import { defaultFetchTextBytes } from '@heynixie/wire';

export interface WebFetchConfig {
  readonly limits: FetchLimits;

  readonly fetchesPerSandbox: number;
  readonly sandboxLimits: SandboxLimits;
}

export const webFetchDefaults: WebFetchConfig = {
  limits: {
    bodyBytes: 2_097_152,
    timeoutMs: 15_000,
    redirects: 5,
    textBytes: defaultFetchTextBytes,
  },
  fetchesPerSandbox: 50,
  sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
};
