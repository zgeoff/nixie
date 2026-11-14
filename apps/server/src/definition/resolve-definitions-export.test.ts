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
        agent: { names: [] },
        owner: { name: null, pronouns: { they: 'they', their: 'their' } },
      },
      'export-token',
    ),
  ).toBeNull();
});

test('it resolves the definitions repo with its token, and no templates or names when none are set', () => {
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
            title: null,
            message: null,
          },
        },
        agent: { names: [] },
        owner: { name: null, pronouns: { they: 'they', their: 'their' } },
      },
      'export-token',
    ),
  ).toStrictEqual({
    repo: {
      repository: 'harbour/definitions',
      base: 'main',
      apiURL: 'https://api.github.com',
      token: 'export-token',
    },
    text: { title: null, message: null, agentName: null, ownerName: null },
  });
});

test('it resolves the export text from the templates, the first agent name and the owner name', () => {
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
            message: '{agent} wrote it for {owner}.\n\n{notes}',
          },
        },
        agent: { names: ['Wren', 'Robin'] },
        owner: { name: 'Morgan', pronouns: { they: 'they', their: 'their' } },
      },
      'export-token',
    )?.text,
  ).toStrictEqual({
    title: 'skills: {operation} {skill}',
    message: '{agent} wrote it for {owner}.\n\n{notes}',
    agentName: 'Wren',
    ownerName: 'Morgan',
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
        agent: { names: [] },
        owner: { name: null, pronouns: { they: 'they', their: 'their' } },
      },
      null,
    ),
  ).toThrowWithMessage(
    Error,
    'the secrets file holds no definitions_export_token, and definitions.export needs it',
  );
});
