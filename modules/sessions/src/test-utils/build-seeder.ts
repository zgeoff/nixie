import { buildConnectorSeeder } from '@heynixie/connectors/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import type { TaskSeederDeps } from '@heynixie/tasks/test-utils';

export type TestDeps = TaskSeederDeps;

export function buildSeeder(deps: TestDeps) {
  const tasks = buildTaskSeeder(deps);
  const connectors = buildConnectorSeeder({ log: deps.context.log });

  return {
    ...tasks,
    ...connectors,

    // a started task on the second route's profile, with the given dollar limit
    meteredTask: async (dollars: number) => {
      const starter = await tasks.conversationStep();

      return tasks.task({
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        options: {
          model: 'second-look',
          profile: 'router-b',
          report: 'none',
          limits: { turns: 25, dollars },
        },
      });
    },
  };
}
