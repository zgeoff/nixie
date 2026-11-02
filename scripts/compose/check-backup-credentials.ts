import { $ } from 'bun';
import { parseStepCommand } from '../lib/parse-step-command.ts';

const composeFiles = ['-f', 'compose.yaml', '-f', 'ci/compose.yaml'];

// The backup passwords reach only the backup container, and nixie's secrets never reach it: the
// backup container mounts the data volume's staging subpath and nothing else.
async function runCLI(): Promise<void> {
  const command = parseStepCommand('check-backup-credentials.ts', [], process.argv.slice(2));

  if (!command.isValid) {
    console.error(command.usage);

    process.exitCode = 2;

    return;
  }

  const config: unknown = await $`docker compose ${composeFiles} config --format json`
    .cwd('deploy/compose')
    .json();

  const services = readField(config, 'services');
  const environment = readField(readField(services, 'nixie'), 'environment');
  const volumes = readField(readField(services, 'nixie-backup'), 'volumes');
  const nixieNames = isObject(environment) ? Object.keys(environment) : [];

  if (nixieNames.some((name) => name.startsWith('NIXIE_BACKUP_'))) {
    console.log('::error::the nixie service holds a backup variable');

    process.exitCode = 1;

    return;
  }

  const mounts = Array.isArray(volumes) ? volumes.map((volume: unknown) => volume) : [];

  if (mounts.some((volume) => readField(volume, 'source') === 'secrets')) {
    console.log('::error::the nixie-backup service mounts the secrets volume');

    process.exitCode = 1;

    return;
  }

  const [staging] = mounts;

  if (
    mounts.length !== 1 ||
    readField(staging, 'source') !== 'data' ||
    readField(readField(staging, 'volume'), 'subpath') !== 'backup'
  ) {
    console.log('::error::the nixie-backup service mounts more than the staging subpath of data');

    process.exitCode = 1;

    return;
  }

  console.log('the backup credentials stay apart');
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function readField(value: unknown, key: string): unknown {
  if (!isObject(value)) {
    return undefined;
  }

  const field: unknown = Reflect.get(value, key);

  return field;
}

if (import.meta.main) {
  await runCLI();
}
