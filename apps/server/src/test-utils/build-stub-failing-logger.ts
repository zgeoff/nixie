import type { Logger } from '@heynixie/logger';

export interface StubFailingLogger {
  // the logger, whose first call throws and whose later calls record their event
  readonly log: Logger;
  readonly events: readonly string[];
}

// Builds a logger that throws on its first call, so the step that logs first fails after its work
// and every later step logs as usual.
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
