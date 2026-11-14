import type { HarnessCapability, HarnessID } from '@heynixie/wire';
import { harnessCapabilities } from '@heynixie/wire';
import type { ModelProfile } from './types';

export interface HarnessFit {
  readonly fits: boolean;
  readonly missing: readonly HarnessCapability[];
}

export function checkHarnessFit(
  profile: Pick<ModelProfile, 'harness'>,
  needs: ReadonlySet<HarnessCapability>,
  capabilities: Readonly<Record<HarnessID, ReadonlySet<HarnessCapability>>> = harnessCapabilities,
): HarnessFit {
  const declared = capabilities[profile.harness];
  const missing = [...needs].filter((need) => !declared.has(need));

  return { fits: missing.length === 0, missing };
}
