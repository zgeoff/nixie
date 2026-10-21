import type { ScriptedReply } from '@heynixie/testing';

export interface RememberCall {
  readonly subject?: 'owner' | 'shared';
  readonly text: string;
  readonly quote: string;

  readonly sourceID: number | undefined;
}

export function buildRememberReply(call: RememberCall): ScriptedReply {
  return {
    toolUse: { name: 'mcp__nixie__memory_remember', input: { subject: 'owner', ...call } },
  };
}
