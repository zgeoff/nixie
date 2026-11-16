import { match } from 'ts-pattern';
import { agentSDKHarnessDefinition } from '../agent/agent-sdk-harness-definition';
import { codexHarnessDefinition } from '../codex/codex-harness-definition';
import type { HarnessProfile } from '../types';
import type { Harness } from './harness';

// Every harness definition. The models config reads each one's profile schema.
export const harnesses = [agentSDKHarnessDefinition, codexHarnessDefinition] as const;

export function bindHarness(profile: HarnessProfile): Harness {
  return match(profile)
    .returnType<Harness>()
    .with({ harness: 'agent-sdk' }, (agentProfile) => ({
      ...agentSDKHarnessDefinition.bind(agentProfile),
      session: agentSDKHarnessDefinition.session,
    }))
    .with({ harness: 'codex' }, (codexProfile) => ({
      ...codexHarnessDefinition.bind(codexProfile),
      session: codexHarnessDefinition.session,
    }))
    .exhaustive();
}
