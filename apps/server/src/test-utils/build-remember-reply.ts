import type { ScriptedReply } from '@heynixie/testing';

export interface RememberCall {
  readonly text: string;
  readonly quote: string;

  // the sequence of the message the quote comes from
  readonly sourceID: number | undefined;
}

// Builds the scripted model reply that calls the writer's memory.remember tool, as the guest names
// it.
export function buildRememberReply(call: RememberCall): ScriptedReply {
  return { toolUse: { name: 'mcp__nixie__memory_remember', input: { ...call } } };
}
