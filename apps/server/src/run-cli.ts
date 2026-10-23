import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { buildBackupCommands } from './build-backup-commands';
import { buildResetCommands } from './build-reset-commands';
import { buildSubjectCommands } from './build-subject-commands';
import { checkEncoder } from './check-encoder';
import { createConsolidationCommands } from './create-consolidation-commands';
import { createDeploymentCommands } from './create-deployment-commands';
import { createMemoryCommands } from './create-memory-commands';
import { createSessionCommands } from './create-session-commands';
import { createSkillCommands } from './create-skill-commands';
import { readCLIArgs } from './read-cli-args';
import type { ParsedCLIArgs } from './read-cli-args';
import { startServer } from './start-server';
import type { CLIFlags, CLIIO, Command } from './types';

const commands = new Map<string, Command>([
  ['serve', (flags, io) => runServe(flags, io)],
  ['check-encoder', (flags, io) => checkEncoder(flags.encoder, io)],
  ...createDeploymentCommands(),
  ...createSessionCommands(),
  ...buildResetCommands(),
  ...createMemoryCommands(),
  ...createConsolidationCommands(),
  ...buildSubjectCommands(),
  ...createSkillCommands(),
  ...buildBackupCommands(),
]);

export async function runCLI(argv: readonly string[], io: CLIIO): Promise<number> {
  const parsed = await readCLIArgs(argv, [...commands.keys()]);

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
