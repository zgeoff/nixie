import { resolveSocketPath } from './resolve-socket-path';
import { sendEnrolmentCodeRequest } from './send-enrolment-code-request';
import { sendSessionRequest } from './send-session-request';
import type { CLIIO, Command } from './types';

// The device session host commands: enrol-code asks the running server for a code that signs one
// device in, sessions lists the live device sessions as JSON, and session-label sets the label of
// one.
export function buildSessionCommands(): readonly (readonly [string, Command])[] {
  return [
    ['enrol-code', (flags, io) => runEnrolCode(flags.config, io)],
    ['sessions', (flags, io) => runSessions(flags.config, io)],
    ['session-label', (flags, io, args) => runSessionLabel(flags.config, io, args)],
  ];
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
