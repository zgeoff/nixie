import { buildConnectorSeeder } from '@heynixie/connectors/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import type { TaskSeederDeps } from '@heynixie/tasks/test-utils';

export type TestDeps = TaskSeederDeps;

export function buildSeeder(deps: TestDeps) {
  return {
    ...buildTaskSeeder(deps),
    ...buildConnectorSeeder({ log: deps.context.log }),
  };
}
