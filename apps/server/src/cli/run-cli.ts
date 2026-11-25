import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { createStageBackupCommands } from '../backup/create-stage-backup-commands';
import { createBudgetCommands } from '../budget/create-budget-commands';
import { createDeploymentCommands } from '../deployment/create-deployment-commands';
import { createPauseCommands } from '../pause/create-pause-commands';
import { createPromptCommands } from '../prompt/create-prompt-commands';
import { startServer } from '../server/start-server';
import { createSpendCommands } from '../spend/create-spend-commands';
import { createTaskCommands } from '../task/create-task-commands';
import { createTurnInputCommands } from '../turn/create-turn-input-commands';
import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';
import { buildBackupCommands } from './build-backup-commands';
import { checkEncoder } from './check-encoder';
import { createContactCommands } from './create-contact-commands';
import { createDefinitionCommands } from './create-definition-commands';
import { createMandateCommands } from './create-mandate-commands';
import { createMcpCommands } from './create-mcp-commands';
import { createMemoryCommands } from './create-memory-commands';
import { createPasskeyCommands } from './create-passkey-commands';
import { createResetCommands } from './create-reset-commands';
import { createRuleCommands } from './create-rule-commands';
import { createSessionCommands } from './create-session-commands';
import { createSkillCommands } from './create-skill-commands';
import { createSubjectCommands } from './create-subject-commands';
import { readCLIArgs } from './read-cli-args';
import type { ParsedCLIArgs } from './read-cli-args';
import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';

const host: HostTransport = { resolveSocketPath, sendHostRequest };
const taskCommands = createTaskCommands(host);

const commands = new Map<string, Command>([
  ['serve', (flags, io) => runServe(flags, io)],
  ['check-encoder', (flags, io) => checkEncoder(flags.encoder, io)],
  ...createDeploymentCommands(),
  ...createSessionCommands(host),
  ...createPasskeyCommands(host),
  ...taskCommands,
  ...createPauseCommands(host),
  ...createSpendCommands(host),
  ...createBudgetCommands(host),
  ...createResetCommands(host),
  ...createMemoryCommands(host),
  ...createSubjectCommands(host),
  ...createSkillCommands(host),
  ...createPromptCommands(host),
  ...createRuleCommands(host),
  ...createDefinitionCommands(host),
  ...createMandateCommands(host),
  ...createMcpCommands(host),
  ...createContactCommands(host),
  ...createTurnInputCommands(host),
  ...buildBackupCommands(),
  ...createStageBackupCommands(host),
]);

export async function runCLI(argv: readonly string[], io: CLIIO): Promise<number> {
  const parsed = await readCLIArgs(
    argv,
    [...commands.keys()],
    taskCommands.map(([name]) => name),
  );

  const run = parsed.kind === 'command' ? commands.get(parsed.command) : undefined;

  if (parsed.kind !== 'command' || run === undefined) {
    return printRefusal(parsed, io);
  }

  try {
    return await run(parsed.flags, io, parsed.args);
  } catch (error) {
    io.log('command.failed', { command: parsed.command, ...toErrorFields(error) });

    return 1;
  }
}

// Bun as PID 1 ignores SIGTERM unless the process handles it, so serve waits for the signal
// itself.
async function runServe(flags: CLIFlags, io: CLIIO): Promise<number> {
  const server = await startServer({
    configPath: flags.config,
    manifestPath: flags.manifest,
    sopsArgv: [flags.sops],
    ...(flags.encoder === '' ? {} : { encoderDir: flags.encoder }),
    log: io.log,
    ...(io.createSandboxAdapter === undefined
      ? {}
      : { createSandboxAdapter: io.createSandboxAdapter }),
    ...(io.harness === undefined ? {} : { harness: io.harness }),
    ...(io.credentialSite === undefined ? {} : { credentialSite: io.credentialSite }),
  });

  const exitCode = await Promise.race([
    waitForStopSignal(io, server.log),
    waitForFailure(server.failed),
    waitForReset(server.reset),
  ]);

  await server.stop();

  return exitCode;
}

async function waitForStopSignal(io: CLIIO, log: Logger): Promise<number> {
  const signal = await io.waitForSignal();

  log('signal.received', { signal });

  return 0;
}

async function waitForFailure(failed: Promise<unknown>): Promise<number> {
  await failed;

  return 1;
}

async function waitForReset(reset: Promise<void>): Promise<number> {
  await reset;

  return 0;
}

function printRefusal(parsed: ParsedCLIArgs, io: CLIIO): number {
  if (parsed.kind === 'invalid-flags') {
    io.print(`nixie: ${parsed.message}`);

    return 1;
  }

  io.print(`nixie has no command ${parsed.command}; it takes ${[...commands.keys()].join(', ')}`);

  return 2;
}
