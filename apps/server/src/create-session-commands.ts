import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIIO, Command } from './types';

export function createSessionCommands(): readonly (readonly [string, Command])[] {
  return [
    ['enrol-code', (flags, io) => runEnrolCode(flags.config, io)],
    ['sessions', (flags, io) => runSessions(flags.config, io)],
    ['session-label', (flags, io, args) => runSessionLabel(flags.config, io, args)],
  ];
}

async function runEnrolCode(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const issued = await sendHostRequest(socketPath, 'enrolment code', (client) =>
    client.sessions.issueCode(),
  );

  io.print(`${issued.code}\nThe code works once, until ${issued.expiresAt.toISOString()}.`);

  return 0;
}

async function runSessions(configPath: string, io: CLIIO): Promise<number> {
  const socketPath = await resolveSocketPath(configPath);

  const sessions = await sendHostRequest(socketPath, 'session list', (client) =>
    client.sessions.list(),
  );

  io.print(JSON.stringify(sessions));

  return 0;
}

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

  const labelled = await sendHostRequest(socketPath, 'session label', (client) =>
    client.sessions.label({ sessionID, label: words.join(' ') }),
  );

  io.print(JSON.stringify(labelled));

  return 0;
}
