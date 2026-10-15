import type { MigrationCheck } from './check-migrations';

export interface MigrationSummary {
  // the last release, or null for the first release, which creates the schema
  readonly since: string | null;
  readonly added: readonly { readonly version: number; readonly name: string }[];

  // whether since can read the schema this release leaves; null for the first release
  readonly readableByReleaseBefore: boolean | null;
}

// The migrations this release adds since lastTag, as release.json carries them for a deployment
// that reads them without parsing the release notes
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
