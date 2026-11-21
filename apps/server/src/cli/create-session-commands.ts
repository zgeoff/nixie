import type { CLIIO, Command, HostTransport } from '../types';

export function createSessionCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [
    ['enrol-code', (flags, io, args) => runEnrolCode(host, { configPath: flags.config, io, args })],
    ['sessions', (flags, io) => runSessions(host, flags.config, io)],
    [
      'session-label',
      (flags, io, args) => runSessionLabel(host, { configPath: flags.config, io, args }),
    ],
  ];
}

interface EnrolCodeCall {
  readonly configPath: string;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

// `nixie enrol-code device` issues a code for a device that shows pictures, which can follow only
// its own stream.
async function runEnrolCode(host: HostTransport, call: EnrolCodeCall): Promise<number> {
  const [kind] = call.args;

  if (kind !== undefined && kind !== 'device') {
    call.io.print('nixie enrol-code takes no argument, or the word device');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.configPath);

  const request = kind === 'device' ? { scope: 'device' as const } : undefined;

  const issued = await host.sendHostRequest(socketPath, 'enrolment code', (client) =>
    client.sessions.issueCode(request),
  );

  call.io.print(`${issued.code}\nThe code works once, until ${issued.expiresAt.toISOString()}.`);

  return 0;
}

async function runSessions(host: HostTransport, configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(configPath);

  const sessions = await host.sendHostRequest(socketPath, 'session list', (client) =>
    client.sessions.list(),
  );

  io.print(JSON.stringify(sessions));

  return 0;
}

interface SessionLabelCall {
  readonly configPath: string;
  readonly io: CLIIO;
  readonly args: readonly string[];
}

async function runSessionLabel(host: HostTransport, call: SessionLabelCall): Promise<number> {
  const [sessionID, ...words] = call.args;

  if (sessionID === undefined || words.length === 0) {
    call.io.print('nixie session-label takes a session ID and a label');

    return 2;
  }

  const socketPath = await host.resolveSocketPath(call.configPath);

  const labelled = await host.sendHostRequest(socketPath, 'session label', (client) =>
    client.sessions.label({ sessionID, label: words.join(' ') }),
  );

  call.io.print(JSON.stringify(labelled));

  return 0;
}
