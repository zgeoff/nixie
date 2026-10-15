import { expect, test } from 'bun:test';
import { renderConfigSchemaNotes } from './render-config-schema-notes';

test('it lists each breaking change since the last release', () => {
  expect(
    renderConfigSchemaNotes(
      ['server.port: changes type to "string"', 'imp.token: becomes required'],
      'v0.4.0',
      '<!-- marker -->',
    ),
  ).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Config schema

    **Breaking:** this release's config.schema.json can refuse a config.yaml that v0.4.0 accepts:

    - \`server.port: changes type to "string"\`
    - \`imp.token: becomes required\`
    "
  `);
});

test('it says that every released config passes when nothing breaks', () => {
  expect(renderConfigSchemaNotes([], 'v0.4.0', '<!-- marker -->')).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Config schema

    Every config.yaml that v0.4.0 accepts passes this release's config.schema.json.
    "
  `);
});

test('it says that no earlier release has a schema to compare with', () => {
  expect(renderConfigSchemaNotes([], null, '<!-- marker -->')).toMatchInlineSnapshot(`
    "<!-- marker -->
    ## Config schema

    This release publishes config.schema.json, and no earlier release publishes one to compare with.
    "
  `);
});
