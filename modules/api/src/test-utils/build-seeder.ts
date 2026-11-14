import { buildActionSeeder } from '@heynixie/actions/test-utils';
import type { ActionSeederDeps } from '@heynixie/actions/test-utils';
import { buildBackupSeeder } from '@heynixie/backup/test-utils';
import { localDataStorage } from '@heynixie/log';
import { buildMemorySeeder } from '@heynixie/memory/test-utils';
import type { MemorySeederDeps } from '@heynixie/memory/test-utils';
import { buildTaskSeeder } from '@heynixie/tasks/test-utils';
import type { TaskSeederDeps } from '@heynixie/tasks/test-utils';
import { buildIdentitySeeder } from './build-identity-seeder';
import type { IdentitySeederDeps } from './build-identity-seeder';

export type TestDeps = ActionSeederDeps &
  TaskSeederDeps &
  IdentitySeederDeps & { readonly memory?: MemorySeederDeps };

type WithMemory = TestDeps & { readonly memory: MemorySeederDeps };

export function buildSeeder(
  deps: WithMemory,
): ReturnType<typeof buildBaseSeeder> & ReturnType<typeof buildMemorySeeder>;

export function buildSeeder(deps: TestDeps): ReturnType<typeof buildBaseSeeder>;

export function buildSeeder(deps: TestDeps) {
  return {
    ...buildBaseSeeder(deps),
    ...(deps.memory === undefined ? {} : buildMemorySeeder(deps.memory)),
  };
}

function buildBaseSeeder(deps: TestDeps) {
  return {
    ...buildActionSeeder({ context: deps.context }),
    ...buildTaskSeeder({ context: deps.context }),
    ...buildBackupSeeder({
      context: { writer: deps.context.log.writer, storage: localDataStorage },
    }),
    ...buildIdentitySeeder({ context: deps.context }),
  };
}
