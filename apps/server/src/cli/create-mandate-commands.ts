import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createMandateCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [
    ['mandates list', (flags, io) => runMandatesList(host, flags, io)],
    ['mandates end', (flags, io) => runMandateEnd(host, flags, io)],
  ];
}

async function runMandatesList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const listed = await host.sendHostRequest(socketPath, 'mandates list', (client) =>
    client.mandates.list(),
  );

  io.print(JSON.stringify(listed));

  return 0;
}

async function runMandateEnd(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const mandateID = flags.mandateID;

  invariant(mandateID !== undefined, 'the CLI parser requires a mandate ID');

  const socketPath = await host.resolveSocketPath(flags.config);

  const ended = await host.sendHostRequest(socketPath, 'mandates end', (client) =>
    client.mandates.end({ mandateID }),
  );

  io.print(JSON.stringify(ended));

  return 0;
}
