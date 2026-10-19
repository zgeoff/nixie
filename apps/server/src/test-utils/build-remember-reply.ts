import type { ScriptedReply } from '@heynixie/testing';

export interface RememberCall {
  // the memory's subject, owner unless the call names shared
  readonly subject?: 'owner' | 'shared';
  readonly text: string;
  readonly quote: string;

  // the sequence of the message the quote comes from
  readonly sourceID: number | undefined;
}

// Builds the scripted model reply that calls the writer's memory.remember tool, as the guest names
// it.
export function buildRememberReply(call: RememberCall): ScriptedReply {
  return {
    toolUse: { name: 'mcp__nixie__memory_remember', input: { subject: 'owner', ...call } },
  };
}
