// `bun libs/db/src/run-migration-check.ts [--released <schema.json> --last-tag <tag>]
// [--release-body <body.md>]` checks the migrations since the last release, prints the release
// notes section, and with --release-body replaces that section in the file.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { checkMigrations } from './check-migrations';
import { nixieSchema } from './nixie-schema';
import { renderMigrationNotes } from './render-migration-notes';

// the last release's schema, as the release workflow reads it from the release tag's own tree
const releasedSchema = z.strictObject({
  migrations: z.array(z.string()),
  oldestReader: z.int().nonnegative(),
});

const marker = '<!-- nixie: migrations -->';

const args = parseArgs({
  options: {
    released: { type: 'string' },
    'last-tag': { type: 'string' },
    'release-body': { type: 'string' },
  },
});

if ((args.values.released === undefined) !== (args.values['last-tag'] === undefined)) {
  process.stderr.write('usage: --released and --last-tag go together\n');
  process.exit(2);
}
const releasedText =
  args.values.released === undefined ? null : await readFile(args.values.released, 'utf8');
const released = releasedText === null ? null : releasedSchema.parse(JSON.parse(releasedText));
const dir = await mkdtemp(join(tmpdir(), 'nixie-migration-check-'));
const check = await checkMigrations(nixieSchema, released, dir);

await rm(dir, { recursive: true, force: true });
const notes = renderMigrationNotes(check, args.values['last-tag'] ?? null, marker);

process.stdout.write(notes);
if (args.values['release-body'] !== undefined) {
  const body = await readFile(args.values['release-body'], 'utf8');
  const kept = body.includes(marker)
    ? body.slice(0, body.indexOf(marker))
    : `${body.trimEnd()}\n\n`;

  await writeFile(args.values['release-body'], `${kept}${notes}`);
}
const refused = check.added.flatMap((migration) =>
  migration.refused.map(
    (statement) =>
      `migration ${migration.version} "${migration.name}" holds a statement that the release before cannot read around: ${statement}`,
  ),
);
const failures = [
  ...check.changed.map((name) => `the build changed or removed the released migration "${name}"`),
  ...refused,
];

if (refused.length > 0) {
  failures.push(
    'A migration that keeps the schema readable adds only tables, columns and indexes. Raise oldestReader in nixie-schema.ts to declare that the release before cannot read the schema.',
  );
}
if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}
