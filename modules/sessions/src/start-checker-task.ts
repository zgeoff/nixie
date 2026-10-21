import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { RunCheck } from './checker-types';
import type { SystemTaskOptions } from './make-system-task-runner';
import { makeSystemTaskRunner } from './make-system-task-runner';
import { startCheckerRunner } from './start-checker-runner';

export interface CheckerTaskOptions extends SystemTaskOptions {
  readonly timeoutMs: number;
  readonly clock: Clock;
  readonly log: Logger;
}

export interface CheckerTask {
  readonly check: RunCheck;
}

export const startCheckerTask = makeSystemTaskRunner<CheckerTaskOptions, CheckerTask>({
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
