import { createActor, toPromise } from 'xstate';
import type { DefinitionsPollOptions } from './definitions-poll-machine';
import { definitionsPollMachine } from './definitions-poll-machine';

export type { DefinitionsPollOptions, DefinitionsProbe } from './definitions-poll-machine';

export interface DefinitionsPoll {
  readonly stop: () => Promise<void>;
}

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
