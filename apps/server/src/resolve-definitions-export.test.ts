import { expect, test } from 'bun:test';
import { resolveDefinitionsExport } from './resolve-definitions-export';

test('it resolves no export when the configuration names no definitions repo', () => {
  expect(
    resolveDefinitionsExport(
      {
        definitions: {
          source: { kind: 'path', path: '/srv/definitions' },
          probeIntervalMs: 300_000,
        },
      },
      'export-token',
    ),
  ).toBeNull();
});

test('it resolves the definitions repo with its token', () => {
  expect(
    resolveDefinitionsExport(
      {
        definitions: {
          source: { kind: 'path', path: '/srv/definitions' },
          probeIntervalMs: 300_000,
          export: {
            repository: 'harbour/definitions',
            base: 'main',
            apiURL: 'https://api.github.com',
            title: 'skills: {operation} {skill}',
            message: null,
          },
        },
      },
      'export-token',
    ),
  ).toStrictEqual({
    repository: 'harbour/definitions',
    base: 'main',
    apiURL: 'https://api.github.com',
    token: 'export-token',
  });
});

test('it refuses a definitions repo when the secrets file holds no token', () => {
  expect(() =>
    resolveDefinitionsExport(
      {
        definitions: {
          source: { kind: 'path', path: '/srv/definitions' },
          probeIntervalMs: 300_000,
          export: {
            repository: 'harbour/definitions',
            base: 'main',
            apiURL: 'https://api.github.com',
            title: null,
            message: null,
          },
        },
      },
      null,
    ),
  ).toThrowWithMessage(
    Error,
    'the secrets file holds no definitions_export_token, and definitions.export needs it',
  );
});
