import { join } from 'node:path';
import { buildBudgetsJSONSchema } from './budget/build-budgets-json-schema';
import { buildRulesJSONSchema } from './rule/build-rules-json-schema';

const files = [
  ['definitions-rules.schema.json', buildRulesJSONSchema()],
  ['definitions-budgets.schema.json', buildBudgetsJSONSchema()],
] as const;

for (const [name, schema] of files) {
  const path = join(import.meta.dir, '..', name);

  await Bun.write(path, `${JSON.stringify(schema, null, 2)}\n`);

  process.stdout.write(`wrote ${path}\n`);
}
