import type { MigrationCheck } from './check-migrations';

// The migrations section of a GitHub release body, opened by marker so that a re-run replaces it:
// each migration added since lastTag, null for the first release, by the schema version it leaves,
// and whether lastTag can read the schema.
export function renderMigrationNotes(
  check: MigrationCheck,
  lastTag: string | null,
  marker: string,
): string {
  const heading = [marker, '## Migrations', ''];

  if (lastTag === null) {
    return [
      ...heading,
      'The first release creates the schema with these migrations.',
      '',
      '| Version | Migration |',
      '| ------- | --------- |',
      ...check.added.map((migration) => `| ${migration.version} | ${migration.name} |`),
      '',
    ].join('\n');
  }
  if (check.added.length === 0) {
    return [...heading, `This release adds no migration since ${lastTag}.`, ''].join('\n');
  }
  const readable = check.readableByReleaseBefore ? 'yes' : 'no';

  return [
    ...heading,
    `The migrations this release adds since ${lastTag}, and whether ${lastTag} can read the schema each leaves.`,
    '',
    `| Version | Migration | Readable by ${lastTag} |`,
    '| ------- | --------- | ---------------------- |',
    ...check.added.map((migration) => `| ${migration.version} | ${migration.name} | ${readable} |`),
    '',
  ].join('\n');
}
