import type { HarnessID } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { agentSDKHarness } from './agent-sdk-harness';
import type { HarnessDescriptor } from './harness-types';

const harnesses: Readonly<Partial<Record<HarnessID, HarnessDescriptor>>> = {
  'agent-sdk': agentSDKHarness,
};

// The models config refuses a profile on a harness with no record, so only a bug asks for one.
export function getHarness(id: HarnessID): HarnessDescriptor {
  const harness = harnesses[id];

  invariant(harness, `the harness ${id} has no record`);

  return harness;
}
