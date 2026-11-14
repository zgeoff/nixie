import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createContactCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [
    ['contacts list', (flags, io) => runContactsList(host, flags, io)],
    ['contacts mark-known', (flags, io) => runContactMark(host, flags, io)],
    ['contacts unmark', (flags, io) => runContactUnmark(host, flags, io)],
  ];
}

async function runContactsList(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const listed = await host.sendHostRequest(socketPath, 'contacts list', (client) =>
    client.contacts.list(),
  );

  io.print(JSON.stringify(listed));

  return 0;
}

// A destination that a known contact already holds changes nothing, and the command prints that
// contact.
async function runContactMark(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const destination = flags.destination;
  const name = flags.name;

  invariant(destination !== undefined, 'the CLI parser requires a destination');

  const socketPath = await host.resolveSocketPath(flags.config);

  const marked = await host.sendHostRequest(socketPath, 'contacts mark-known', (client) =>
    client.contacts.markKnown({ destination, ...(name === undefined ? {} : { name }) }),
  );

  io.print(JSON.stringify(marked.contact));

  return 0;
}

async function runContactUnmark(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const contactID = flags.contactID;

  invariant(contactID !== undefined, 'the CLI parser requires a contact ID');

  const socketPath = await host.resolveSocketPath(flags.config);

  const unmarked = await host.sendHostRequest(socketPath, 'contacts unmark', (client) =>
    client.contacts.unmark({ contactID }),
  );

  io.print(JSON.stringify(unmarked));

  return 0;
}
