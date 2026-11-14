import { buildLogSeeder } from '@heynixie/log/test-utils';
import type { LogSeederDeps } from '@heynixie/log/test-utils';

export type TestDeps = LogSeederDeps;

export function buildSeeder(deps: TestDeps) {
  return { ...buildLogSeeder(deps) };
}
