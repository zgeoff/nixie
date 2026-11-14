import type { HarnessCapability } from '../host/harness-ids';
import { harnessCapabilities } from '../host/harness-ids';

// The Agent SDK's capabilities, less one.
export function buildCapabilitiesWithout(
  capability: HarnessCapability,
): ReadonlySet<HarnessCapability> {
  return new Set(harnessCapabilities['agent-sdk']).difference(new Set([capability]));
}
