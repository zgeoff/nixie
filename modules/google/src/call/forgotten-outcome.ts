import type { ToolOutcome } from '@heynixie/tools';

export const forgottenOutcome = {
  status: 'error',
  message: '{"origin":"nixie","kind":"connection_unavailable"}',
  failure: { code: 'connection_unavailable' },
} as const satisfies ToolOutcome;
