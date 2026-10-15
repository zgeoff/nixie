import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogLevel } from '@heynixie/ops';

export interface BootFiles {
  readonly dataDir: string;
  readonly configPath: string;
  readonly manifestPath: string;
  readonly sopsPath: string;

  // the deployment key in the secrets file, as base64 of its 32 bytes
  readonly deploymentKey: string;
}

export interface BootFileExtras {
  // YAML lines appended to the configuration file
  readonly config: readonly string[];

  // YAML lines appended to the secrets file
  readonly secrets: readonly string[];

  // the server section's log level, which the configuration leaves at its default when unset
  readonly logLevel?: LogLevel;
}

// Writes what nixie needs to start in a test directory: the definitions, a plaintext secrets file
// for the sops stand-in, the sandbox manifest, and a configuration on a free loopback port with
// the scripted model as the conversation's profile.
export async function writeBootFiles(
  dir: string,
  modelURL: string,
  extras: BootFileExtras,
): Promise<BootFiles> {
  const dataDir = join(dir, 'data');
  const deploymentKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

  await mkdir(dataDir);
  await writeDefinitions(join(dir, 'definitions'));
  await writeSecrets(join(dir, 'secrets.yaml'), deploymentKey, extras.secrets);
  await writeManifest(join(dir, 'sandbox-manifest.json'));
  await writeStubSops(join(dir, 'sops'));
  await writeConfig(dir, [...buildConfigLines(dir, modelURL, extras.logLevel), ...extras.config]);

  return {
    dataDir,
    configPath: join(dir, 'config.yaml'),
    manifestPath: join(dir, 'sandbox-manifest.json'),
    sopsPath: join(dir, 'sops'),
    deploymentKey,
  };
}

// the seed needs a manifest and a persona
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

// a test build's process double runs each guest from the workspace, whatever the image
async function writeManifest(path: string): Promise<void> {
  const manifest = {
    conversation: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
    fetch: `ghcr.io/example/nixie-fetch@sha256:${'f'.repeat(64)}`,
  };

  await writeFile(path, JSON.stringify(manifest));
}

// nixie runs sops as one executable path
async function writeStubSops(path: string): Promise<void> {
  const stub = join(import.meta.dir, 'run-stub-sops.ts');

  await writeFile(path, `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`);
  await chmod(path, 0o755);
}

function buildConfigLines(
  dir: string,
  modelURL: string,
  logLevel: LogLevel | undefined,
): readonly string[] {
  return [
    'server:',
    `  data_dir: ${join(dir, 'data')}`,
    '  hostname: 127.0.0.1',
    '  port: 0',
    `  secrets_file: ${join(dir, 'secrets.yaml')}`,
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
    `  source: { kind: path, path: ${join(dir, 'definitions')} }`,
  ];
}

async function writeConfig(dir: string, lines: readonly string[]): Promise<void> {
  await writeFile(join(dir, 'config.yaml'), `${lines.join('\n')}\n`);
}
