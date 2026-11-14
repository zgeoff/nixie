import { buildActionSeeder } from '@heynixie/actions/test-utils';
import type { ActionSeederDeps } from '@heynixie/actions/test-utils';

export type TestDeps = ActionSeederDeps;

export function buildSeeder(deps: TestDeps) {
  return { ...buildActionSeeder({ context: deps.context }) };
}
