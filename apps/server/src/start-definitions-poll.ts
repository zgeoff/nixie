import { createActor, toPromise } from 'xstate';
import type { DefinitionsPollOptions } from './definitions-poll-machine';
import { definitionsPollMachine } from './definitions-poll-machine';

export type { DefinitionsPollOptions, DefinitionsProbe } from './definitions-poll-machine';

export interface DefinitionsPoll {
  // ends the poll, after the seed in flight if one runs
  readonly stop: () => Promise<void>;
}

// Probes the definitions source every interval, or sooner after a failure, and seeds again on a new
// probe token. Each probe and seed finishes before the next starts, so 2 seeds never overlap and an
// older revision never commits after a newer one.
export function startDefinitionsPoll(options: DefinitionsPollOptions): DefinitionsPoll {
  const poll = createActor(definitionsPollMachine, { input: options });

  poll.start();

  return {
    stop: async () => {
      if (poll.getSnapshot().status === 'active') {
        poll.send({ type: 'stop' });
      }

      await toPromise(poll);
    },
  };
}
