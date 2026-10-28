import { expect, onTestFinished, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildConfigJSONSchema } from './build-config-json-schema';
import { deploymentConfigSchema } from './deployment-config-schema';
import { getConfigValidator } from './test-utils/get-config-validator';

function setupTest() {
  return { validate: getConfigValidator() };
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
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const ctx = setupTest();

  const text = await readFile(
    join(import.meta.dir, '..', '..', '..', 'deploy', 'kubernetes', 'config.yaml'),
    'utf8',
  );

  const manifestSchema = z.looseObject({
    metadata: z.looseObject({ name: z.string() }),
    data: z.record(z.string(), z.string()),
  });

  const manifests = z.array(manifestSchema).parse(Bun.YAML.parse(text));

  const example = manifests.find((manifest) => manifest.metadata.name === 'nixie-config')?.data[
    'config.yaml'
  ];

  invariant(example !== undefined);

  ctx.validate(Bun.YAML.parse(example));

  expect(ctx.validate.errors).toBeNull();
});

test('it accepts a configuration with only the required sections', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

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
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

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
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

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

test('it refuses the test sandbox, which a release build does not hold', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

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
    sandbox: { adapter: 'test' },
    imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
    definitions: { source: { kind: 'path', path: '/definitions' } },
  });

  expect(ctx.validate.errors).toPartiallyContain({ instancePath: '/sandbox/adapter' });
});

test('it refuses a model URL that is not HTTP', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const ctx = setupTest();

  ctx.validate({
    models: {
      profiles: {
        main: {
          base_url: 'ftp://models.example.com',
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
    instancePath: '/models/profiles/main/base_url',
  });
});

test.each([
  [
    'a configuration with only the required sections',
    {
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
    },
    true,
  ],
  [
    'the test sandbox',
    {
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
      sandbox: { adapter: 'test' },
      imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    false,
  ],
  [
    'the imp sandbox set by name',
    {
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
      sandbox: { adapter: 'imp' },
      imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    true,
  ],
  [
    'no imp section',
    {
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
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    false,
  ],
  [
    'an FTP model URL',
    {
      models: {
        profiles: {
          main: {
            base_url: 'ftp://models.example.com',
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
    },
    false,
  ],
  [
    'a model URL with no slashes after the scheme',
    {
      models: {
        profiles: {
          main: {
            base_url: 'https:models.example.com',
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
    },
    false,
  ],
  [
    'a model URL with an uppercase scheme',
    {
      models: {
        profiles: {
          main: {
            base_url: 'HTTPS://models.example.com',
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
    },
    true,
  ],
  [
    'a plain HTTP imp URL',
    {
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
      imp: { url: 'http://impd.example.com:8443', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    true,
  ],
  [
    'an FTP imp URL',
    {
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
      imp: { url: 'ftp://impd.example.com', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    false,
  ],
  [
    'no conversation role',
    {
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
        roles: { task: 'main' },
      },
      imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    false,
  ],
  [
    'an uppercase IPv6 host address',
    {
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
      imp: { url: 'https://impd.example.com', host_addresses: ['2001:DB8::/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    true,
  ],
  [
    'a host address that is a name',
    {
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
      imp: { url: 'https://impd.example.com', host_addresses: ['gateway.example.com'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    false,
  ],
  [
    'a canonical time zone',
    {
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
      time: { default_zone: 'Europe/Lisbon' },
    },
    true,
  ],
  [
    'a time zone that does not exist',
    {
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
      time: { default_zone: 'Mars/Olympus_Mons' },
    },
    false,
  ],
  [
    'a context cap below the CLI range',
    {
      models: {
        profiles: {
          main: {
            base_url: 'https://models.example.com',
            credential: 'deployment:models',
            auth_header: 'bearer',
            model: 'model-large',
            effort: 'medium',
            context_tokens: 99_999,
          },
        },
        roles: { conversation: 'main' },
      },
      imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
      definitions: { source: { kind: 'path', path: '/definitions' } },
    },
    false,
  ],
  [
    'a port past 65535',
    {
      server: { port: 65_536 },
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
    },
    false,
  ],
  [
    'a profile ID that is not a slug',
    {
      models: {
        profiles: {
          Main: {
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
    },
    false,
  ],
])('it gives the same answer as a release build for %s', (_label, config, expected) => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const ctx = setupTest();
  const isSchemaValid = ctx.validate(config);
  const isNixieValid = deploymentConfigSchema.safeParse(config).success;

  expect(isSchemaValid).toBe(expected);
  expect(isNixieValid).toBe(expected);
});

test('it refuses a time zone alias that a release build reads', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const ctx = setupTest();

  const config = {
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
    time: { default_zone: 'europe/lisbon' },
  };

  const isSchemaValid = ctx.validate(config);
  const isNixieValid = deploymentConfigSchema.safeParse(config).success;

  expect(isSchemaValid).toBeFalse();
  expect(isNixieValid).toBeTrue();
});

test('it accepts a role that names a missing profile, which a release build refuses', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  const ctx = setupTest();

  const config = {
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
      roles: { conversation: 'main', task: 'spare' },
    },
    imp: { url: 'https://impd.example.com', host_addresses: ['192.0.2.10/32'] },
    definitions: { source: { kind: 'path', path: '/definitions' } },
  };

  const isSchemaValid = ctx.validate(config);
  const isNixieValid = deploymentConfigSchema.safeParse(config).success;

  expect(isSchemaValid).toBeTrue();
  expect(isNixieValid).toBeFalse();
});
