import { expect, test } from 'bun:test';
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
      '      base_url: "https://api.anthropic.com/"',
      '      credential: deployment:broker',
      '      auth_header: bearer',
      '      model: model-small',
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

  if (!result.ok) {
    throw new Error(result.error);
  }

  expect(Bun.YAML.parse(result.config)).toStrictEqual({
    server: { data_dir: '/data', port: 8080, secrets_file: '/var/lib/example/secrets.yaml' },
    models: {
      profiles: {
        quick: {
          base_url: 'https://api.anthropic.com/preview-a',
          credential: 'deployment:broker',
          auth_header: 'bearer',
          model: 'model-small',
          effort: 'low',
        },
      },
      roles: { conversation: 'quick' },
    },
    sandbox: { adapter: 'test' },
    definitions: { source: { kind: 'path', path: '/srv/example/definitions' } },
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
        '      base_url: https://api.anthropic.com',
        '      credential: deployment:broker',
        '      auth_header: bearer',
        '      model: model-small',
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
