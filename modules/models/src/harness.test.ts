import { expect, test } from 'bun:test';
import type { AgentSDKProfile } from './agent-sdk-harness-definition';
import { agentSDKHarnessDefinition } from './agent-sdk-harness-definition';
import type { HarnessDefinition } from './harness';

test('it refuses at type-check a definition whose session disagrees with its capabilities', () => {
  const codexWithSession: HarnessDefinition<'codex', AgentSDKProfile> = {
    id: 'codex',
    profileSchema: agentSDKHarnessDefinition.profileSchema,
    bind: agentSDKHarnessDefinition.bind,

    // @ts-expect-error a harness without resume has no session
    session: agentSDKHarnessDefinition.session,
  };

  const agentSDKWithoutSession: HarnessDefinition<'agent-sdk', AgentSDKProfile> = {
    id: 'agent-sdk',
    profileSchema: agentSDKHarnessDefinition.profileSchema,
    bind: agentSDKHarnessDefinition.bind,

    // @ts-expect-error a harness with resume has a session
    session: null,
  };

  expect([codexWithSession.id, agentSDKWithoutSession.id]).toStrictEqual(['codex', 'agent-sdk']);
});
