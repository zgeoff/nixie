import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { collectBreakingConfigChanges } from './collect-breaking-config-changes';
import { hasBreakingMarker } from './has-breaking-marker';
import { renderConfigSchemaNotes } from './render-config-schema-notes';

const marker = '<!-- nixie: config schema -->';

const args = parseArgs({
  options: {
    released: { type: 'string' },
    'last-tag': { type: 'string' },
    title: { type: 'string' },
    'release-body': { type: 'string' },
    summary: { type: 'string' },
  },
});

if ((args.values.released === undefined) !== (args.values['last-tag'] === undefined)) {
  process.stderr.write('usage: --released and --last-tag go together\n');
  process.exit(2);
}

const currentText = await readFile(join(import.meta.dir, '..', 'config.schema.json'), 'utf8');

const current: unknown = JSON.parse(currentText);

const releasedText =
  args.values.released === undefined ? null : await readFile(args.values.released, 'utf8');

const released: unknown = releasedText === null ? null : JSON.parse(releasedText);
const breaking = released === null ? [] : collectBreakingConfigChanges(released, current);
const lastTag = args.values['last-tag'] ?? null;
const notes = renderConfigSchemaNotes(breaking, lastTag, marker);

process.stdout.write(notes);

if (args.values['release-body'] !== undefined) {
  const body = await readFile(args.values['release-body'], 'utf8');

  const kept = body.includes(marker)
    ? body.slice(0, body.indexOf(marker))
    : `${body.trimEnd()}\n\n`;

  await writeFile(args.values['release-body'], `${kept}${notes}`);
}

if (args.values.summary !== undefined) {
  await writeFile(args.values.summary, `${JSON.stringify({ since: lastTag, breaking })}\n`);
}

if (
  breaking.length > 0 &&
  args.values.title !== undefined &&
  !hasBreakingMarker(args.values.title)
) {
  process.stderr.write(
    `the config schema can refuse a config.yaml that ${lastTag ?? 'the last release'} accepts, so the pull request title must mark a breaking change with "!", as in "feat(config)!: …", for the changelog to list it\n`,
  );

  process.exit(1);
}
