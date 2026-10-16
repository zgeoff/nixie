import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { RunCheck } from '@heynixie/sessions';
import { startCheckerRunner } from '@heynixie/sessions';
import type { SystemTaskOptions } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';

export interface CheckerOptions extends SystemTaskOptions {
  readonly timeoutMs: number;
  readonly clock: Clock;
  readonly log: Logger;
}

export interface Checker {
  readonly check: RunCheck;
}

// Starts the checker on the checker role's profile, as a system task with its own session: one
// query with no tools per check, in its own sandbox on the conversation image.
export const startChecker = makeSystemTaskRunner<CheckerOptions, Checker>({
  role: 'checker',
  entry: 'check',
  start: async (options, session) => {
    const check = await startCheckerRunner({
      profile: session.profile,
      sandboxes: options.sandboxes,
      image: options.image,
      limits: session.limits,
      command: session.command,
      timeoutMs: options.timeoutMs,
      clock: options.clock,
      log: options.log,
    });

    return { check };
  },
});
