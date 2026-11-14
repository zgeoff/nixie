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

  expect(result.data).toStrictEqual({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    probeIntervalMs: 60_000,
  });
});

test('it reads the export repo with the main branch and GitHub API by default', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: { repository: 'harbour/definitions' },
  });

  expect(result.data).toStrictEqual({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    probeIntervalMs: 300_000,
    export: {
      repository: 'harbour/definitions',
      base: 'main',
      apiURL: 'https://api.github.com',
      title: null,
      message: null,
    },
  });
});

test('it reads the title and message templates of the export', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: {
      repository: 'harbour/definitions',
      title: 'skills: {operation} {skill}',
      message: '{agent} for {owner}: approval {approval}, proposal {proposal}.\n\n{notes}',
    },
  });

  expect(result.data).toStrictEqual({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    probeIntervalMs: 300_000,
    export: {
      repository: 'harbour/definitions',
      base: 'main',
      apiURL: 'https://api.github.com',
      title: 'skills: {operation} {skill}',
      message: '{agent} for {owner}: approval {approval}, proposal {proposal}.\n\n{notes}',
    },
  });
});

test('it refuses a title template with an unknown placeholder, and names it', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: { repository: 'harbour/definitions', title: 'skills: {verb} {skill}' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['export', 'title'],
    message:
      'unknown placeholder {verb}; use {skill}, {operation}, {agent}, {owner}, {approval}, {proposal}',
  });
});

test('it refuses the notes in a title template', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: { repository: 'harbour/definitions', title: '{skill}: {notes}' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['export', 'title'],
    message:
      'unknown placeholder {notes}; use {skill}, {operation}, {agent}, {owner}, {approval}, {proposal}',
  });
});

test('it refuses a message template with an unknown placeholder, and names it', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: { repository: 'harbour/definitions', message: '{notes}\n\nSee {link}.' },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['export', 'message'],
    message:
      'unknown placeholder {link}; use {skill}, {operation}, {agent}, {owner}, {approval}, {proposal}, {notes}',
  });
});

test('it refuses an export repo that is not owner/name', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: { repository: 'definitions' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['export', 'repository'] });
});

test('it refuses an export API that is not https', () => {
  const result = definitionsConfigSchema.safeParse({
    source: { kind: 'path', path: '/etc/nixie/definitions' },
    export: { repository: 'harbour/definitions', api_url: 'http://api.example.test' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['export', 'api_url'] });
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
    path: [],
    code: 'unrecognized_keys',
    keys: ['probe_intervall_ms'],
  });
});
