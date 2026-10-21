import type { Logger } from '@heynixie/logger';

export interface StubFailingLogger {
  readonly log: Logger;
  readonly events: readonly string[];
}

export function buildStubFailingLogger(): StubFailingLogger {
  const events: string[] = [];
  const state = { hasFailed: false };

  return {
    log: (event) => {
      if (!state.hasFailed) {
        state.hasFailed = true;
        throw new Error(`the logger refused ${event}`);
      }

      events.push(event);
    },
    events,
  };
}
