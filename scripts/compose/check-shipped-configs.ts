import { appendFileSync, readFileSync } from 'node:fs';
import { getStepEnv } from '../lib/get-step-env.ts';
import { parseStepCommand } from '../lib/parse-step-command.ts';
import { findConfigProblem } from './find-config-problem.ts';
import { parseServerPin } from './parse-server-pin.ts';

const shipped = [
  {
    configPath: 'deploy/compose/config.yaml',
    recipePath: 'deploy/compose/compose.yaml',
    isConfigMap: false,
  },
  {
    configPath: 'deploy/kubernetes/config.yaml',
    recipePath: 'deploy/kubernetes/nixie.yaml',
    isConfigMap: true,
  },
];

// Checks each config.yaml that the repo ships against the config schema of the release its recipe
// pins, because a deployment that copies the recipe runs that release, never the checkout.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-shipped-configs.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const summaryPath = getStepEnv(process.env, 'GITHUB_STEP_SUMMARY');
  const releasesURL = getStepEnv(process.env, 'RELEASES_URL');

  for (const file of shipped) {
    const pin = parseServerPin(readFileSync(file.recipePath, 'utf8'));

    if ('problem' in pin) {
      console.log(`::error::${file.recipePath} ${pin.problem}`);

      process.exitCode = 1;

      return;
    }

    const tag = `v${pin.version}`;

    const schema = await readReleaseSchema(`${releasesURL}/${tag}/config.schema.json`);

    if (schema === null) {
      process.exitCode = 1;

      return;
    }

    const parsed: unknown = Bun.YAML.parse(readFileSync(file.configPath, 'utf8'));
    const config = file.isConfigMap ? readConfigMapConfig(parsed) : parsed;
    const problem = findConfigProblem(schema, config);

    if (problem !== null) {
      console.log(`::error::the ${tag} config schema refuses ${file.configPath}: ${problem}`);

      process.exitCode = 1;

      return;
    }

    appendFileSync(summaryPath, `${file.configPath} against ${tag}\n`);
  }
}

async function readReleaseSchema(url: string): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok) {
    console.log(`::error::${url} answered ${String(response.status)}`);

    return null;
  }

  const schema: unknown = await response.json();

  return schema;
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
  await runCLI();
}
