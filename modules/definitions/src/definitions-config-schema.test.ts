import { expect, test } from 'bun:test';
import { definitionsConfigSchema } from './definitions-config-schema';

test('it reads a path source and probes every 5 min by default', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
  });

  expect(result.data).toStrictEqual({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    probeIntervalMs: 300_000,
  });
});

test('it takes the probe interval the file names', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    probe_interval_ms: 60_000,
  });

  expect(result.data?.probeIntervalMs).toBe(60_000);
});

test('it refuses a source kind that no slice has built', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'git', path: '/etc/nixie/definitions' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['source', 'kind'] });
});

test('it refuses an unknown key', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    probe_intervall_ms: 60_000,
  });

  expect(result.error?.issues).toPartiallyContain({
    code: 'unrecognized_keys',
    keys: ['probe_intervall_ms'],
  });
});
