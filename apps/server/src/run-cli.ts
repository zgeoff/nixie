import { parseArgs } from 'node:util';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import { buildConsolidationCommands } from './build-consolidation-commands';
import { buildDeploymentCommands } from './build-deployment-commands';
import { buildMemoryCommands } from './build-memory-commands';
import { buildResetCommands } from './build-reset-commands';
import { buildSessionCommands } from './build-session-commands';
import { checkEncoder } from './check-encoder';
import { startServer } from './start-server';
import type { CLIFlags, CLIIO, Command } from './types';

// Runs one of nixie's commands, serve by default, and returns its exit code. --config names the
// deployment configuration; --manifest, --sops and --encoder name what the nixie image fixes.
export async function runCLI(argv: readonly string[], io: CLIIO): Promise<number> {
  const parsed = parseArgs({ args: [...argv], allowPositionals: true, options: cliOptions });
  const command = parsed.positionals[0] ?? 'serve';
  const run = commands.get(command);

  if (run === undefined) {
    io.print(`nixie has no command ${command}; it takes ${[...commands.keys()].join(', ')}`);

    return 2;
  }

  try {
    return await run(parsed.values, io, parsed.positionals.slice(1));
  } catch (error) {
    io.log('command.failed', { command, ...toErrorFields(error) });

    return 1;
  }
}

const cliOptions = {
  config: { type: 'string', default: '/etc/nixie/config.yaml' },
  manifest: { type: 'string', default: '/app/sandbox-manifest.json' },

  // an empty value serves with keyword memory search alone, as the tests that run nixie do
  encoder: { type: 'string', default: '/app/encoder' },
  sops: { type: 'string', default: '/usr/local/bin/sops' },
  live: { type: 'boolean', default: false },
  hash: { type: 'string' },
  revise: { type: 'string' },
  'as-new': { type: 'boolean', default: false },
  text: { type: 'string' },
  reason: { type: 'string' },
  'keep-sessions': { type: 'boolean', default: false },
  yes: { type: 'boolean', default: false },
} as const;

// serve runs the server until SIGTERM; check-encoder exits 0 once the encoder loads from --encoder
// and encodes a text.
const commands = new Map<string, Command>([
  ['serve', (flags, io) => runServe(flags, io)],
  ['check-encoder', (flags, io) => checkEncoder(flags.encoder, io)],
  ...buildDeploymentCommands(),
  ...buildSessionCommands(),
  ...buildResetCommands(),
  ...buildMemoryCommands(),
  ...buildConsolidationCommands(),
]);

// Bun as PID 1 ignores SIGTERM unless the process handles it, so serve waits for the signal
// itself. A runner failure, such as another process taking the writer, exits 1, and a finished
// reset exits 0.
async function runServe(flags: CLIFlags, io: CLIIO): Promise<number> {
  const server = await startServer({
    configPath: flags.config,
    manifestPath: flags.manifest,
    sopsArgv: [flags.sops],
    ...(flags.encoder === '' ? {} : { encoderDir: flags.encoder }),
    log: io.log,
  });

  const exitCode = await Promise.race([
    waitForStopSignal(io, server.log),
    waitForFailure(server.failed),
    waitForReset(server.reset),
  ]);

  await server.stop();

  return exitCode;
}

// the server's logger holds the configured level, which the command's own logger predates
async function waitForStopSignal(io: CLIIO, log: Logger): Promise<number> {
  const signal = await io.waitForSignal();

  log('signal.received', { signal });

  return 0;
}

async function waitForFailure(failed: Promise<unknown>): Promise<number> {
  await failed;

  return 1;
}

// a reset leaves the server with no work, so it stops, and the normal start rebuilds the rest
async function waitForReset(reset: Promise<void>): Promise<number> {
  await reset;

  return 0;
}
