import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stubSopsPath } from '@heynixie/credentials/test-utils';
import type { LogLevel } from '@heynixie/logger';
import { readStarterRulesText } from '@heynixie/policy/test-utils';

export interface BootFiles {
  readonly dataDir: string;
  readonly configPath: string;
  readonly manifestPath: string;
  readonly sopsPath: string;

  readonly deploymentKey: string;
}

interface BootTaskDefinition {
  readonly id: string;

  // the text of task.yaml
  readonly yaml: string;

  // the text of instructions.md
  readonly instructions: string;
}

interface BootSkill {
  readonly name: string;
  readonly description: string;

  // the text under the frontmatter of SKILL.md
  readonly body: string;
}

export interface BootFileExtras {
  readonly config: readonly string[];

  readonly secrets: readonly string[];

  readonly definitions?: readonly string[];

  readonly logLevel?: LogLevel;

  readonly sandboxAdapter?: 'imp' | 'test';

  // the definitions carry the starter rules, which a test then approves
  readonly hasStarterRules?: boolean;

  // task definitions that the first seed reads, which put the definitions at format 4
  readonly taskDefinitions?: readonly BootTaskDefinition[];

  // skills that the first seed reads, which put the definitions at format 4 as well
  readonly skills?: readonly BootSkill[];

  readonly isBackupOn?: boolean;

  // the test build turns every feature on; a suite of a nixie with neither the computer nor the code
  // tool leaves their sections out
  readonly isComputerOff?: boolean;
  readonly isCodeOff?: boolean;
  readonly isGoogleOff?: boolean;
  readonly isDevicesOff?: boolean;

  // the text of voice/voice.yaml, which puts the definitions at format 5
  readonly voiceYaml?: string;

  readonly modelCredential?: 'secrets-file' | 'sandbox-backend';

  // leaves the profiles' prices out, for a config that holds a spending gateway
  readonly isGatewayPriced?: boolean;

  readonly roleModelURLs?: Readonly<Partial<Record<'checker' | 'task' | 'worker', string>>>;

  readonly selectableModelURLs?: Readonly<Record<string, string>>;
}

export async function writeBootFiles(
  directory: string,
  modelURL: string,
  extras: BootFileExtras,
): Promise<BootFiles> {
  const dataDir = join(directory, 'data');
  const deploymentKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');

  await mkdir(dataDir);

  await writeDefinitions(join(directory, 'definitions'), {
    hasStarterRules: extras.hasStarterRules ?? false,
    taskDefinitions: extras.taskDefinitions ?? [],
    voiceYaml: extras.voiceYaml ?? null,
    skills: extras.skills ?? [],
  });

  await writeSecrets(join(directory, 'secrets.yaml'), deploymentKey, extras);
  await writeManifest(join(directory, 'sandbox-manifest.json'), extras);
  await writeStubSops(join(directory, 'sops'));

  await writeConfig(directory, [
    ...buildConfigLines(directory, modelURL, extras),
    ...(extras.definitions ?? []).map((line) => `  ${line}`),
    'sandbox:',
    `  adapter: ${extras.sandboxAdapter ?? 'test'}`,

    // a start stages a backup set at once, which copies both databases, so a test that does not ask
    // for backups keeps them off
    'backup:',
    `  enabled: ${String(extras.isBackupOn ?? false)}`,
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

interface DefinitionsFiles {
  readonly hasStarterRules: boolean;
  readonly taskDefinitions: readonly BootTaskDefinition[];
  readonly voiceYaml: string | null;
  readonly skills: readonly BootSkill[];
}

async function writeDefinitions(definitionsDir: string, files: DefinitionsFiles): Promise<void> {
  const format =
    files.voiceYaml === null
      ? pickDefinitionsFormat(files.hasStarterRules, files.taskDefinitions, files.skills)
      : 5;

  await mkdir(definitionsDir);
  await writeFile(join(definitionsDir, 'nixie.yaml'), `format: ${String(format)}\n`);
  await writeFile(join(definitionsDir, 'persona.md'), 'You are nixie.\n');

  if (files.hasStarterRules) {
    await mkdir(join(definitionsDir, 'rules'));
    await writeFile(join(definitionsDir, 'rules', 'starter.yaml'), readStarterRulesText());
  }

  if (files.voiceYaml !== null) {
    await mkdir(join(definitionsDir, 'voice'));
    await writeFile(join(definitionsDir, 'voice', 'voice.yaml'), files.voiceYaml);
  }

  for (const skill of files.skills) {
    const skillDir = join(definitionsDir, 'skills', skill.name);

    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${skill.body}\n`,
    );
  }

  for (const definition of files.taskDefinitions) {
    const taskDir = join(definitionsDir, 'tasks', definition.id);

    await mkdir(taskDir, { recursive: true });
    await writeFile(join(taskDir, 'task.yaml'), definition.yaml);
    await writeFile(join(taskDir, 'instructions.md'), definition.instructions);
  }
}

// Tasks need format 4, and the starter rules need 3.
function pickDefinitionsFormat(
  hasStarterRules: boolean,
  taskDefinitions: readonly BootTaskDefinition[],
  skills: readonly BootSkill[],
): number {
  if (taskDefinitions.length > 0 || skills.length > 0) {
    return 4;
  }

  return hasStarterRules ? 3 : 2;
}

async function writeSecrets(
  path: string,
  deploymentKey: string,
  extras: BootFileExtras,
): Promise<void> {
  const lines = [
    `deployment_key: ${deploymentKey}`,
    'impd_token: impd-test-token',
    ...(extras.modelCredential === 'sandbox-backend'
      ? []
      : ['model_credentials:', '  scripted: scripted-model-key']),
    ...extras.secrets,
  ];

  await writeFile(path, `${lines.join('\n')}\n`);
}

// A manifest of a feature that is off leaves that feature's image out, so a start that still needs
// the image refuses.
async function writeManifest(path: string, extras: BootFileExtras): Promise<void> {
  const manifest = {
    conversation: `ghcr.io/example/nixie-conversation@sha256:${'c'.repeat(64)}`,
    fetch: `ghcr.io/example/nixie-fetch@sha256:${'f'.repeat(64)}`,
    ...(extras.isCodeOff === true
      ? {}
      : { code: `ghcr.io/example/nixie-code@sha256:${'d'.repeat(64)}` }),
    codex: `ghcr.io/example/nixie-codex@sha256:${'e'.repeat(64)}`,
    ...(extras.isComputerOff === true
      ? {}
      : { computer: `ghcr.io/example/nixie-computer@sha256:${'a'.repeat(64)}` }),
    render: `ghcr.io/example/nixie-render@sha256:${'b'.repeat(64)}`,
  };

  await writeFile(path, JSON.stringify(manifest));
}

async function writeStubSops(path: string): Promise<void> {
  await writeFile(path, `#!/bin/sh\nexec "${process.execPath}" "${stubSopsPath}" "$@"\n`);
  await chmod(path, 0o755);
}

async function writeConfig(directory: string, lines: readonly string[]): Promise<void> {
  await writeFile(join(directory, 'config.yaml'), `${lines.join('\n')}\n`);
}

function buildConfigLines(
  directory: string,
  modelURL: string,
  extras: BootFileExtras,
): readonly string[] {
  const roleModels = Object.entries(extras.roleModelURLs ?? {});
  const selectableModels = Object.entries(extras.selectableModelURLs ?? {});

  // A gateway prices each reply, so a profile behind one sets no prices.
  const priceLines =
    extras.isGatewayPriced === true
      ? []
      : [
          '      prices: { input: 1, cache_write: 1, cache_write_1h: 1, cached_input: 0.1, output: 4 }',
        ];

  return [
    'server:',
    `  data_dir: ${join(directory, 'data')}`,
    '  hostname: 127.0.0.1',
    '  port: 0',
    `  secrets_file: ${join(directory, 'secrets.yaml')}`,
    ...(extras.logLevel === undefined ? [] : [`  log_level: ${extras.logLevel}`]),
    'models:',
    '  profiles:',
    '    scripted:',
    '      harness: agent-sdk',
    `      base_url: ${modelURL}`,
    '      credential: deployment:scripted',
    '      auth_header: x-api-key',
    '      model: claude-test-1',
    '      effort: low',
    ...priceLines,
    ...roleModels.flatMap(([role, url]) => [
      `    scripted-${role}:`,
      '      harness: agent-sdk',
      `      base_url: ${url}`,
      '      credential: deployment:scripted',
      '      auth_header: x-api-key',
      '      model: claude-test-1',
      '      effort: low',
      ...priceLines,
    ]),
    ...selectableModels.flatMap(([name, url]) => [
      `    selectable-${name}:`,
      '      harness: agent-sdk',
      `      base_url: ${url}`,
      '      credential: deployment:scripted',
      '      auth_header: bearer',
      `      model: claude-${name}-test-model`,
      '      effort: low',
      ...priceLines,
    ]),
    '  roles:',
    '    conversation: scripted',
    ...roleModels.map(([role]) => `    ${role}: scripted-${role}`),
    ...(selectableModels.length === 0 ? [] : ['  selectable:']),
    ...selectableModels.map(
      ([name]) =>
        `    ${name}: { profile: selectable-${name}, description: "The ${name} test model" }`,
    ),
    'imp:',
    '  url: http://127.0.0.1:7070',
    ...(extras.isComputerOff === true ? [] : ['computer: {}']),
    ...(extras.isCodeOff === true ? [] : ['code: {}']),
    ...(extras.isGoogleOff === true || extras.config.includes('google:') ? [] : ['google: {}']),
    ...(extras.isDevicesOff === true || extras.config.includes('devices:') ? [] : ['devices: {}']),
    'definitions:',
    `  source: { kind: path, path: ${join(directory, 'definitions')} }`,
  ];
}
