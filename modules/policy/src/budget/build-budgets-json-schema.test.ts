import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { buildBudgetsJSONSchema } from './build-budgets-json-schema';

function setupTest() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });

  return { validate: ajv.compile(buildBudgetsJSONSchema()) };
}

test('it matches the committed definitions-budgets.schema.json', async () => {
  const committed = await readFile(
    join(import.meta.dir, '..', '..', 'definitions-budgets.schema.json'),
    'utf8',
  );

  expect(`${JSON.stringify(buildBudgetsJSONSchema(), null, 2)}\n`).toBe(committed);
});

test('it accepts a budgets file with a spend budget and a tool budget', () => {
  const ctx = setupTest();

  ctx.validate(
    Bun.YAML.parse(
      'shopping-month:\n  counts: spend\n  limit: 100\n  period: month\nsearch-day:\n  counts: tool:search\n  limit: 5\n  period: day\n',
    ),
  );

  expect(ctx.validate.errors).toBeNull();
});

test('it refuses a budget with no limit', () => {
  const ctx = setupTest();

  ctx.validate(Bun.YAML.parse('shopping-month:\n  counts: spend\n  period: month\n'));

  expect(ctx.validate.errors).toContainEqual(
    expect.objectContaining({ instancePath: '/shopping-month' }),
  );
});
