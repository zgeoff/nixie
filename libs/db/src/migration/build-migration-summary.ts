import type { MigrationCheck } from './check-migrations';

export interface MigrationSummary {
  readonly since: string | null;
  readonly added: readonly { readonly version: number; readonly name: string }[];

  readonly readableByReleaseBefore: boolean | null;
}

export function buildMigrationSummary(
  check: MigrationCheck,
  lastTag: string | null,
): MigrationSummary {
  return {
    since: lastTag,
    added: check.added.map((migration) => ({ version: migration.version, name: migration.name })),
    readableByReleaseBefore: lastTag === null ? null : check.readableByReleaseBefore,
  };
}
