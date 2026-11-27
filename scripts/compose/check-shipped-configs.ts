import { appendFileSync, readFileSync } from 'node:fs';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { findConfigProblem } from './find-config-problem.ts';

const schemaPath = 'apps/server/config.schema.json';

const shipped = [
  { path: 'deploy/compose/config.yaml', isConfigMap: false },
  { path: 'deploy/kubernetes/config.yaml', isConfigMap: true },
];

// Checks that the schema in this checkout accepts each config.yaml that the repo ships, so a
// section a feature switch adds never becomes required of a deployment that leaves it out.
function runCLI(): void {
  const command = parseStepCommand('check-shipped-configs.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));

  for (const file of shipped) {
    const parsed: unknown = Bun.YAML.parse(readFileSync(file.path, 'utf8'));
    const config = file.isConfigMap ? readConfigMapConfig(parsed) : parsed;
    const problem = findConfigProblem(schema, config);

    if (problem !== null) {
      console.log(`::error::${schemaPath} refuses ${file.path}: ${problem}`);

      process.exitCode = 1;

      return;
    }

    appendFileSync(summaryPath, `${file.path}\n`);
  }
}

function readConfigMapConfig(documents: unknown): unknown {
  const configMaps = Array.isArray(documents) ? documents : [documents];

  for (const configMap of configMaps) {
    const text = readField(readField(configMap, 'data'), 'config.yaml');

    if (typeof text === 'string') {
      return Bun.YAML.parse(text);
    }
  }

  return undefined;
}

function readField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const field: unknown = Reflect.get(value, key);

  return field;
}

if (import.meta.main) {
  runCLI();
}
