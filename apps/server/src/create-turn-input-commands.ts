import { parseDuration } from '@heynixie/turn-inputs';
import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createTurnInputCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [
    ['turn-input on', (flags, io) => runTurnInputOn(host, flags, io)],
    ['turn-input off', (flags, io) => runTurnInputOff(host, flags, io)],
    ['turn-input list', (flags, io) => runTurnInputList(host, flags, io)],
    ['turn-input open', (flags, io) => runTurnInputOpen(host, flags, io)],
  ];
}

async function runTurnInputOn(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const forMs = readForMs(flags.for);

  const socketPath = await host.resolveSocketPath(flags.config);

  const set = await host.sendHostRequest(socketPath, 'turn-input on', (client) =>
    client.turnInputs.set({ state: 'on', forMs }),
  );

  io.print(JSON.stringify(set));

  return 0;
}

function readForMs(text: string | undefined): number | null {
  if (text === undefined) {
    return null;
  }

  const durationMs = parseDuration(text);

  if (durationMs === null) {
    throw new Error('--for takes a duration such as 30m, 2h or 1d');
  }

  return durationMs;
}

async function runTurnInputOff(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const set = await host.sendHostRequest(socketPath, 'turn-input off', (client) =>
    client.turnInputs.set({ state: 'off', drop: flags.drop === true }),
  );

  io.print(JSON.stringify(set));

  return 0;
}

async function runTurnInputList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const request = flags.limit === undefined ? {} : { limit: flags.limit };

  const listed = await host.sendHostRequest(socketPath, 'turn-input list', (client) =>
    client.turnInputs.list(request),
  );

  io.print(JSON.stringify(listed));

  return 0;
}

// The body goes to stdout as the bytes the model received.
async function runTurnInputOpen(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const inputID = flags.inputID;

  invariant(inputID !== undefined, 'the CLI parser requires an input ID');
  invariant(io.writeBytes !== undefined, 'the CLI writes bytes to stdout');

  const socketPath = await host.resolveSocketPath(flags.config);

  const opened = await host.sendHostRequest(socketPath, 'turn-input open', (client) =>
    client.turnInputs.open({ inputID }),
  );

  io.writeBytes(Buffer.from(opened.body, 'base64'));

  return 0;
}
