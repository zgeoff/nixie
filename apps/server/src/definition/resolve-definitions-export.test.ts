import { expect, test } from 'bun:test';
import { resolveDefinitionsExport } from './resolve-definitions-export';

function setupTest() {
  return {
    appConfig: {
      definitions: {
        source: { kind: 'path', path: '/srv/definitions' },
        probeIntervalMs: 300_000,
        export: {
          repository: 'harbour/definitions',
          base: 'main',
          apiURL: 'https://api.github.com',
          app: { clientID: 'Iv1.harbour', installationID: 4242 },
          title: null,
          message: null,
        },
      },
      agent: { names: [] },
      owner: { name: null, pronouns: { they: 'they', their: 'their' } },
    } as const,
  };
}

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
      { token: 'export-token', appKey: null },
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
            app: null,
            title: null,
            message: null,
          },
        },
        agent: { names: [] },
        owner: { name: null, pronouns: { they: 'they', their: 'their' } },
      },
      { token: 'export-token', appKey: null },
    ),
  ).toStrictEqual({
    repo: {
      repository: 'harbour/definitions',
      base: 'main',
      apiURL: 'https://api.github.com',
      readToken: expect.any(Function),
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
            app: null,
            title: 'skills: {operation} {skill}',
            message: '{agent} wrote it for {owner}.\n\n{notes}',
          },
        },
        agent: { names: ['Wren', 'Robin'] },
        owner: { name: 'Morgan', pronouns: { they: 'they', their: 'their' } },
      },
      { token: 'export-token', appKey: null },
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
            app: null,
            title: null,
            message: null,
          },
        },
        agent: { names: [] },
        owner: { name: null, pronouns: { they: 'they', their: 'their' } },
      },
      { token: null, appKey: null },
    ),
  ).toThrowWithMessage(
    Error,
    'definitions.export names no app, so the secrets file needs definitions_export_token',
  );
});

test.each([
  [
    'the secrets file holds no app key',
    { token: null, appKey: null },
    'definitions.export names an app, so the secrets file needs definitions_export_app_key',
  ],
  [
    'the secrets file holds both the token and the app key',
    { token: 'export-token', appKey: 'pem' },
    'the secrets file holds definitions_export_token, and definitions.export names an app: sign the export in with the token or with the app, not both',
  ],
])('it refuses an app when %s', (_title, secrets, message) => {
  expect(() => resolveDefinitionsExport(setupTest().appConfig, secrets)).toThrowWithMessage(
    Error,
    message,
  );
});

test('it refuses the token path when the secrets file holds an app key too', () => {
  const ctx = setupTest();

  expect(() =>
    resolveDefinitionsExport(
      {
        ...ctx.appConfig,
        definitions: {
          ...ctx.appConfig.definitions,
          export: { ...ctx.appConfig.definitions.export, app: null },
        },
      },
      { token: 'export-token', appKey: 'pem' },
    ),
  ).toThrowWithMessage(
    Error,
    'the secrets file holds definitions_export_app_key, but definitions.export names no app: sign the export in with the token or with the app, not both',
  );
});

test('it resolves an app with the key in the secrets file into a token reader', () => {
  const ctx = setupTest();
  const settings = resolveDefinitionsExport(ctx.appConfig, { token: null, appKey: 'pem' });

  expect(settings?.repo.readToken).toBeFunction();
});
