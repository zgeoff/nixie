import { parseArgs } from 'node:util';
import { toErrorFields } from '@heynixie/ops';
import { buildConsolidationCommands } from './build-consolidation-commands';
import { buildMemoryCommands } from './build-memory-commands';
import { loadDeploymentConfig } from './load-deployment-config';
import { resolveSocketPath } from './resolve-socket-path';
import { sendEnrolmentCodeRequest } from './send-enrolment-code-request';
import { sendSessionRequest } from './send-session-request';
import { startServer } from './start-server';
import type { CLIFlags, CLIIO, Command } from './types';

// Runs one of nixie's commands, serve by default, and returns its exit code. --config names the
// deployment configuration; --manifest and --sops name what the nixie image fixes.
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
  sops: { type: 'string', default: '/usr/local/bin/sops' },
  live: { type: 'boolean', default: false },
  hash: { type: 'string' },
  revise: { type: 'string' },
  'as-new': { type: 'boolean', default: false },
  text: { type: 'string' },
} as const;

// serve runs the server until SIGTERM; enrol-code asks the running server for a code that signs
// one device in; health exits 0 when the running server answers ready, or live with --live.
const commands = new Map<string, Command>([
  ['serve', (flags, io) => runServe(flags, io)],
  ['enrol-code', (flags, io) => runEnrolCode(flags.config, io)],

  // sessions lists the live device sessions as JSON; session-label sets the label of one
  ['sessions', (flags, io) => runSessions(flags.config, io)],
  ['session-label', (flags, io, args) => runSessionLabel(flags.config, io, args)],
  ['health', (flags) => runHealth(flags.config, flags.live)],
  ...buildMemoryCommands(),
  ...buildConsolidationCommands(),
]);

// Bun as PID 1 ignores SIGTERM unless the process handles it, so serve waits for the signal
// itself. A runner failure, such as another process taking the writer, exits 1.
async function runServe(flags: CLIFlags, io: CLIIO): Promise<number> {
  const server = await startServer({
    configPath: flags.config,
    manifestPath: flags.manifest,
    sopsArgv: [flags.sops],
    log: io.log,
  });
  const exitCode = await Promise.race([waitForStopSignal(io), waitForFailure(server.failed)]);

  await server.stop();
  return exitCode;
}

async function waitForStopSignal(io: CLIIO): Promise<number> {
  const signal = await io.waitForSignal();

  io.log('signal.received', { signal });
  return 0;
}

async function waitForFailure(failed: Promise<unknown>): Promise<number> {
  await failed;
  return 1;
}

async function runEnrolCode(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);
  const issued = await sendEnrolmentCodeRequest(socketPath);

  io.print(`${issued.code}\nThe code works once, until ${issued.expiresAt.toISOString()}.`);
  return 0;
}

async function runSessions(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);
  const sessions = await sendSessionRequest(socketPath, { command: 'list' });

  io.print(JSON.stringify(sessions));
  return 0;
}

// the label is every word after the session's ID, so a label with spaces needs no quotes
async function runSessionLabel(
  configPath: string,
  io: CLIIO,
  args: readonly string[],
): Promise<number> {
  const [sessionID, ...words] = args;

  if (sessionID === undefined || words.length === 0) {
    io.print('nixie session-label takes a session ID and a label');
    return 2;
  }
  const socketPath = await resolveSocketPath(configPath);
  const labelled = await sendSessionRequest(socketPath, {
    command: 'label',
    sessionID,
    label: words.join(' '),
  });

  io.print(JSON.stringify(labelled));
  return 0;
}

// the container runtime's check from inside the container, where a wildcard address answers on
// loopback
async function runHealth(configPath: string, isLive: boolean): Promise<number> {
  const config = await loadDeploymentConfig(configPath);
  const isWildcard = ['0.0.0.0', '::'].includes(config.server.hostname);
  const host = isWildcard ? '127.0.0.1' : config.server.hostname;
  const path = isLive ? 'live' : 'ready';
  const response = await Bun.fetch(`http://${host}:${config.server.port}/health/${path}`);

  return response.ok ? 0 : 1;
}
