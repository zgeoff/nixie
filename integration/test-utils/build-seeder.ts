import { buildIdentitySeeder } from '@heynixie/api/test-utils';
import type { IdentitySeederDeps } from '@heynixie/api/test-utils';
import { buildMemorySeeder } from '@heynixie/memory/test-utils';
import type { MemorySeederDeps } from '@heynixie/memory/test-utils';

export type TestDeps = IdentitySeederDeps;

export function buildSeeder(
  deps: IdentitySeederDeps & { readonly memory: MemorySeederDeps },
): ReturnType<typeof buildIdentitySeeder> & ReturnType<typeof buildMemorySeeder>;

export function buildSeeder(deps: TestDeps): ReturnType<typeof buildIdentitySeeder>;

export function buildSeeder(deps: TestDeps & { readonly memory?: MemorySeederDeps }) {
  return {
    ...buildIdentitySeeder(deps),
    ...(deps.memory === undefined ? {} : buildMemorySeeder(deps.memory)),
  };
}
