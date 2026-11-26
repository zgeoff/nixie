import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildPreviewRouteConfig } from './build-preview-route-config';

test('it puts the route on the end of each model profile base URL and keeps every other field', () => {
  const result = buildPreviewRouteConfig(
    'preview-a',
    [
      'server:',
      '  data_dir: /data',
      '  port: 8080',
      '  secrets_file: /var/lib/example/secrets.yaml',
      'models:',
      '  profiles:',
      '    quick:',
      '      harness: agent-sdk',
      '      base_url: "https://api.anthropic.com/"',
      '      credential: deployment:broker',
      '      auth_header: bearer',
      '      model: model-small',
      '      outside_claude: false',
      '      effort: low',
      '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
      '  roles:',
      '    conversation: quick',
      'sandbox:',
      '  adapter: test',
      'definitions:',
      '  source:',
      '    kind: path',
      '    path: /srv/example/definitions',
    ].join('\n'),
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  expect(Bun.YAML.parse(result.config)).toStrictEqual({
    server: { data_dir: '/data', port: 8080, secrets_file: '/var/lib/example/secrets.yaml' },
    models: {
      profiles: {
        quick: {
          harness: 'agent-sdk',
          base_url: 'https://api.anthropic.com/preview-a',
          credential: 'deployment:broker',
          auth_header: 'bearer',
          model: 'model-small',
          outside_claude: false,
          effort: 'low',
          prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 },
        },
      },
      roles: { conversation: 'quick' },
    },
    sandbox: { adapter: 'test' },
    definitions: { source: { kind: 'path', path: '/srv/example/definitions' } },
  });
});

test('it leaves a plan profile alone and routes every other profile', () => {
  const result = buildPreviewRouteConfig(
    'preview-a',
    [
      'models:',
      '  profiles:',
      '    quick:',
      '      harness: agent-sdk',
      '      base_url: "https://api.anthropic.com/"',
      '      credential: deployment:broker',
      '      auth_header: bearer',
      '      model: model-small',
      '      outside_claude: false',
      '      effort: low',
      '    codex-plan:',
      '      harness: codex',
      '      base_url: https://chatgpt.com',
      '      credential: deployment:codex-plan',
      '      chatgpt_login: true',
      '      model: model-o',
      '      effort: low',
      '  roles:',
      '    conversation: quick',
      '    task: codex-plan',
      'spendStop:',
      '  control: http://127.0.0.1:18091',
      '  token: deployment:gateway-control',
      '  modelURL: http://127.0.0.1:18090',
      'sandbox:',
      '  adapter: test',
      'definitions:',
      '  source:',
      '    kind: path',
      '    path: /srv/example/definitions',
    ].join('\n'),
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  const profileSchema = z.object({ base_url: z.string() });
  const profilesSchema = z.record(z.string(), profileSchema);
  const configSchema = z.object({ models: z.object({ profiles: profilesSchema }) });
  const config = configSchema.parse(Bun.YAML.parse(result.config));
  const entries = Object.entries(config.models.profiles);
  const baseURLs = entries.map(([name, profile]) => [name, profile.base_url]);

  expect(Object.fromEntries(baseURLs)).toStrictEqual({
    quick: 'https://api.anthropic.com/preview-a',
    'codex-plan': 'https://chatgpt.com',
  });
});

test.each(['Preview-A', 'preview/a', '-preview', 'preview a', ''])(
  'it refuses the route %p',
  (route) => {
    const result = buildPreviewRouteConfig(
      route,
      [
        'server:',
        '  data_dir: /data',
        '  port: 8080',
        '  secrets_file: /var/lib/example/secrets.yaml',
        'models:',
        '  profiles:',
        '    quick:',
        '      harness: agent-sdk',
        '      base_url: https://api.anthropic.com',
        '      credential: deployment:broker',
        '      auth_header: bearer',
        '      model: model-small',
        '      outside_claude: false',
        '      outside_claude: false',
        '      effort: low',
        '  roles:',
        '    conversation: quick',
        'sandbox:',
        '  adapter: test',
        'definitions:',
        '  source:',
        '    kind: path',
        '    path: /srv/example/definitions',
      ].join('\n'),
    );

    expect(result).toStrictEqual({
      ok: false,
      error: `NIXIE_PREVIEW_MODEL_ROUTE must be a lowercase slug, not '${route}'`,
    });
  },
);

test('it refuses a config that is not a deployment config', () => {
  const result = buildPreviewRouteConfig('preview-a', 'models:\n  profiles:\n    quick: {}\n');

  expect(result).toStrictEqual({
    ok: false,
    error: 'the preview config is not a deployment config with model profiles',
  });
});

test('it refuses text that is not YAML', () => {
  const result = buildPreviewRouteConfig('preview-a', 'models: [unclosed');

  expect(result).toStrictEqual({
    ok: false,
    error: 'the preview config is not a deployment config with model profiles',
  });
});
