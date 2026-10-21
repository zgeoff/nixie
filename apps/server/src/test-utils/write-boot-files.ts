import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogLevel } from '@heynixie/logger';

export interface BootFiles {
  readonly dataDir: string;
  readonly configPath: string;
  readonly manifestPath: string;
  readonly sopsPath: string;

  readonly deploymentKey: string;
}

export interface BootFileExtras {
  readonly config: readonly string[];

  readonly secrets: readonly string[];

  readonly definitions?: readonly string[];

  readonly logLevel?: LogLevel;

  readonly sandboxAdapter?: 'imp' | 'test';
}

export async function writeBootFiles(
  directory: string,
  modelURL: string,
  extras: BootFileExtras,
): Promise<BootFiles> {
  const dataDir = join(directory, 'data');
  const deploymentKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

  await mkdir(dataDir);
  await writeDefinitions(join(directory, 'definitions'));
  await writeSecrets(join(directory, 'secrets.yaml'), deploymentKey, extras.secrets);
  await writeManifest(join(directory, 'sandbox-manifest.json'));
  await writeStubSops(join(directory, 'sops'));

  await writeConfig(directory, [
    ...buildConfigLines(directory, modelURL, extras.logLevel),
    ...(extras.definitions ?? []).map((line) => `  ${line}`),
    'sandbox:',
    `  adapter: ${extras.sandboxAdapter ?? 'test'}`,
    ...extras.config,
  ]);

  return {
    dataDir,
    configPath: join(directory, 'config.yaml'),
    manifestPath: join(directory, 'sandbox-manifest.json'),
    sopsPath: join(directory, 'sops'),
    deploymentKey,
  };
}

async function writeDefinitions(definitionsDir: string): Promise<void> {
  await mkdir(definitionsDir);
  await writeFile(join(definitionsDir, 'nixie.yaml'), 'format: 1\n');
  await writeFile(join(definitionsDir, 'persona.md'), 'You are nixie.\n');
}

async function writeSecrets(
  path: string,
  deploymentKey: string,
  extraSecrets: readonly string[],
): Promise<void> {
  const lines = [
    `deployment_key: ${deploymentKey}`,
    'impd_token: impd-test-token',
    'model_credentials:',
    '  scripted: scripted-model-key',
    ...extraSecrets,
  ];

  await writeFile(path, `${lines.join('\n')}\n`);
}

async function writeManifest(path: string): Promise<void> {
  const manifest = {
    conversation: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
    fetch: `ghcr.io/example/nixie-fetch@sha256:${'f'.repeat(64)}`,
  };

  await writeFile(path, JSON.stringify(manifest));
}

async function writeStubSops(path: string): Promise<void> {
  const stub = join(import.meta.dir, 'run-stub-sops.ts');

  await writeFile(path, `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`);
  await chmod(path, 0o755);
}

async function writeConfig(directory: string, lines: readonly string[]): Promise<void> {
  await writeFile(join(directory, 'config.yaml'), `${lines.join('\n')}\n`);
}

function buildConfigLines(
  directory: string,
  modelURL: string,
  logLevel: LogLevel | undefined,
): readonly string[] {
  return [
    'server:',
    `  data_dir: ${join(directory, 'data')}`,
    '  hostname: 127.0.0.1',
    '  port: 0',
    `  secrets_file: ${join(directory, 'secrets.yaml')}`,
    ...(logLevel === undefined ? [] : [`  log_level: ${logLevel}`]),
    'models:',
    '  profiles:',
    '    scripted:',
    `      base_url: ${modelURL}`,
    '      credential: deployment:scripted',
    '      auth_header: x-api-key',
    '      model: claude-test-1',
    '      effort: low',
    '  roles:',
    '    conversation: scripted',
    'imp:',
    '  url: http://127.0.0.1:7070',
    'definitions:',
    `  source: { kind: path, path: ${join(directory, 'definitions')} }`,
  ];
}
