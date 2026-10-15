import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020';
import invariant from 'tiny-invariant';
import { buildConfigJSONSchema } from './build-config-json-schema';

function setupTest() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  addFormats(ajv);

  return { validate: ajv.compile(buildConfigJSONSchema()) };
}

// Each release publishes the committed file, and the schema check reads it at the last release
// tag, so the file must match the schema it was cut with. Run `bun run --cwd apps/server
// config-schema` to rewrite it.
test('it matches the committed config.schema.json', async () => {
  const committed = await readFile(join(import.meta.dir, '..', 'config.schema.json'), 'utf8');

  expect(`${JSON.stringify(buildConfigJSONSchema(), null, 2)}\n`).toBe(committed);
});

test('it builds the same schema from the same configuration', () => {
  expect(buildConfigJSONSchema()).toStrictEqual(buildConfigJSONSchema());
});

test('it accepts the example configuration in the Kubernetes reference manifests', async () => {
  const ctx = setupTest();

  const text = await readFile(
    join(import.meta.dir, '..', '..', '..', 'deploy', 'kubernetes', 'config.yaml'),
    'utf8',
  );

  const manifests = Bun.YAML.parse(text) as readonly {
    readonly metadata: { readonly name: string };
    readonly data: Readonly<Record<string, string>>;
  }[];

  const example = manifests.find((manifest) => manifest.metadata.name === 'nixie-config')?.data[
    'config.yaml'
  ];

  invariant(example);

  ctx.validate(Bun.YAML.parse(example));

  expect(ctx.validate.errors).toBeNull();
});

test('it accepts a configuration with only the required sections', () => {
  const ctx = setupTest();

  ctx.validate({
    models: {
      profiles: {
        main: {
          base_url: 'https://models.example.com',
          credential: 'deployment:models',
          auth_header: 'bearer',
          model: 'model-large',
          effort: 'medium',
        },
      },
      roles: { conversation: 'main' },
    },
    imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
    definitions: { source: { kind: 'path', path: '/definitions' } },
  });

  expect(ctx.validate.errors).toBeNull();
});

test('it refuses an unknown key in a section', () => {
  const ctx = setupTest();

  ctx.validate({
    server: { port: 8080, ports: 8081 },
    models: {
      profiles: {
        main: {
          base_url: 'https://models.example.com',
          credential: 'deployment:models',
          auth_header: 'bearer',
          model: 'model-large',
          effort: 'medium',
        },
      },
      roles: { conversation: 'main' },
    },
    imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
    definitions: { source: { kind: 'path', path: '/definitions' } },
  });

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '/server',
    params: { additionalProperty: 'ports' },
  });
});

test('it refuses a credential that is not a deployment reference', () => {
  const ctx = setupTest();

  ctx.validate({
    models: {
      profiles: {
        main: {
          base_url: 'https://models.example.com',
          credential: 'plain-text-key',
          auth_header: 'bearer',
          model: 'model-large',
          effort: 'medium',
        },
      },
      roles: { conversation: 'main' },
    },
    imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
    definitions: { source: { kind: 'path', path: '/definitions' } },
  });

  expect(ctx.validate.errors).toPartiallyContain({
    instancePath: '/models/profiles/main/credential',
  });
});
