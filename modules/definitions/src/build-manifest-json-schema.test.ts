import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { buildManifestJSONSchema } from './build-manifest-json-schema';

function setupTest() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  return { validate: ajv.compile(buildManifestJSONSchema()) };
}

// Run `bun run --cwd modules/definitions manifest-schema` to rewrite the committed file.
test('it matches the committed definitions-manifest.schema.json', async () => {
  const committed = await readFile(
    join(import.meta.dir, '..', 'definitions-manifest.schema.json'),
    'utf8',
  );

  expect(`${JSON.stringify(buildManifestJSONSchema(), null, 2)}\n`).toBe(committed);
});

test('it builds the same schema from the same manifest schema', () => {
  expect(buildManifestJSONSchema()).toStrictEqual(buildManifestJSONSchema());
});

test.each([
  ['format 2, which this release writes', 'format: 2\n'],
  ['format 2 and a skill list', 'format: 2\nskills:\n  - triage\n  - travel\n'],
  ['format 1, which the release before writes', 'format: 1\n'],
  [
    'format 1 and a skill list that is not a list, which format 1 ignores',
    'format: 1\nskills: 5\n',
  ],
  ['a key the seed does not read', 'format: 2\nname: mine\n'],
])('it accepts a manifest with %s', (_label, manifest) => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse(manifest));

  expect(ctx.validate.errors).toBeNull();
});

test.each([
  ['format 3, which a newer release writes', 'format: 3\n', '/format'],
  ['format 0', 'format: 0\n', '/format'],
  ['a text format', 'format: one\n', '/format'],
  ['a fractional format', 'format: 1.5\n', '/format'],
  ['no format', 'name: mine\n', ''],
  ['format 2 and a skill list that is not a list', 'format: 2\nskills: triage\n', '/skills'],
  ['format 2 and a skill name that is not text', 'format: 2\nskills:\n  - 5\n', '/skills/0'],
])('it refuses a manifest with %s', (_label, manifest, instancePath) => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse(manifest));

  expect(ctx.validate.errors).toPartiallyContain({ instancePath });
});
