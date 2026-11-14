import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { buildRulesJSONSchema } from './build-rules-json-schema';

function setupTest() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false,
  });

  return { validate: ajv.compile(buildRulesJSONSchema()) };
}

test('it matches the committed definitions-rules.schema.json', async () => {
  const committed = await readFile(
    join(import.meta.dir, '..', 'definitions-rules.schema.json'),
    'utf8',
  );

  expect(`${JSON.stringify(buildRulesJSONSchema(), null, 2)}\n`).toBe(committed);
});

test.each([
  [
    'an allow for a domain',
    'allow-mail-to-team:\n  outcome: allow\n  tools: [mail.send]\n  destinations: ["*@example.com"]\n',
  ],
  [
    'an ask with a check',
    'ask-mail-attachments:\n  outcome: ask\n  checks:\n    - { arg: attachments, op: matches, value: "*" }\n',
  ],
  [
    'an ask on a list of models',
    'ask-off-claude:\n  outcome: ask\n  checks:\n    - { arg: model, op: in, value: [glm, sol] }\n',
  ],
  [
    'definitions and the context task',
    'ask-triage:\n  outcome: ask\n  contexts: [task]\n  definitions: [inbox-triage]\n',
  ],
  [
    'the old names jobs and job',
    'ask-triage:\n  outcome: ask\n  contexts: [job]\n  jobs: [inbox-triage]\n',
  ],
  ['a deny on effects', 'deny-device:\n  outcome: deny\n  effects: [device]\n'],
])('it accepts a rules file with %s', (_label, text) => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse(text));

  expect(ctx.validate.errors).toBeNull();
});

test.each([
  ['an unknown field', 'allow-reads:\n  outcome: allow\n  effect: [read]\n', '/allow-reads'],
  [
    'an unknown effect',
    'allow-reads:\n  outcome: allow\n  effects: [teleport]\n',
    '/allow-reads/effects/0',
  ],
  ['an ID with capitals', 'Allow-Reads:\n  outcome: allow\n', ''],
  ['no outcome', 'allow-reads:\n  effects: [read]\n', '/allow-reads'],
  [
    'a mandate rule without an expiry',
    'allow-invites:\n  outcome: allow\n  tools: [calendar.invite]\n  mandate: invites-today\n',
    '/allow-invites',
  ],
])('it refuses a rules file with %s', (_label, text, instancePath) => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse(text));

  expect(ctx.validate.errors).toContainEqual(expect.objectContaining({ instancePath }));
});
