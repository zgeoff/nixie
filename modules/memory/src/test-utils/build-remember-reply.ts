import type { StubGuestReply } from '@heynixie/sandbox/test-utils';

export interface RememberCall {
  readonly subject?: 'owner' | 'shared';
  readonly text: string;
  readonly quote: string;

  readonly sourceID: number | undefined;

  readonly until?: string;
}

export function buildRememberReply(call: RememberCall): StubGuestReply {
  return {
    toolUse: { name: 'memory.remember', input: { subject: 'owner', ...call } },
  };
}
