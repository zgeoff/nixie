import type { HarnessID } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { agentSDKHarnessDefinition } from './agent-sdk-harness-definition';
import type { Harness, HarnessDefinition, HarnessSession } from './harness';
import type { HarnessProfile } from './types';

// Every harness definition. The models config reads each one's profile schema.
type AnyHarnessDefinition = Omit<HarnessDefinition<HarnessID, HarnessProfile>, 'session'> & {
  readonly session: HarnessSession | null;
};

export const harnesses: readonly [AnyHarnessDefinition, ...AnyHarnessDefinition[]] = [
  agentSDKHarnessDefinition,
];

// The models config refuses a profile on a harness with no definition, so only a bug gives one.
export function bindHarness(profile: HarnessProfile): Harness {
  const definition = harnesses.find((candidate) => candidate.id === profile.harness);

  invariant(definition, `the harness ${profile.harness} has no definition`);

  return { ...definition.bind(profile), session: definition.session };
}
