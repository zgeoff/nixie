import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { buildManifestJSONSchema } from './build-manifest-json-schema';

// A definitions repo validates its nixie.yaml with a stock JSON Schema validator, so each test reads
// the manifest through one
function setupTest() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  return { validate: ajv.compile(buildManifestJSONSchema()) };
}

// Each release publishes the committed file, so the file must match the schema it was cut with. Run
// `bun run --cwd modules/definitions manifest-schema` to rewrite it.
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

test('it accepts a manifest with the format this release writes', () => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse('format: 1\n'));

  expect(ctx.validate.errors).toBeNull();
});

test('it accepts a manifest with a key the seed does not read', () => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse('format: 1\nname: mine\n'));

  expect(ctx.validate.errors).toBeNull();
});

test.each([
  ['format 2, which a newer release writes', 'format: 2\n', '/format'],
  ['format 0', 'format: 0\n', '/format'],
  ['a text format', 'format: one\n', '/format'],
  ['a fractional format', 'format: 1.5\n', '/format'],
  ['no format', 'name: mine\n', ''],
])('it refuses a manifest with %s', (_label, manifest, instancePath) => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse(manifest));

  expect(ctx.validate.errors).toPartiallyContain({ instancePath });
});
