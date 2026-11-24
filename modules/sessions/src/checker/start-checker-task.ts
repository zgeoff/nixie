import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { SystemTaskOptions } from '../task/make-system-task-runner';
import { makeSystemTaskRunner } from '../task/make-system-task-runner';
import type { RunCheck } from './checker-request';
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
      store: options.credentials.store,
      sandboxes: options.sandboxes,
      image: session.image,
      limits: session.limits,
      command: session.command,
      timeoutMs: options.timeoutMs,
      clock: options.clock,
      ...(options.gateway === undefined ? {} : { gateway: options.gateway }),
      log: options.log,
    });

    return { check };
  },
});
