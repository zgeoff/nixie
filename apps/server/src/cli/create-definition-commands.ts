import invariant from 'tiny-invariant';
import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createDefinitionCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [['definitions resolve', (flags, io) => runDefinitionResolve(host, flags, io)]];
}

async function runDefinitionResolve(
  host: HostTransport,
  flags: CLIFlags,
  io: CLIIO,
): Promise<number> {
  const definitionID = flags.definitionID;
  const keep = flags.keep;

  invariant(definitionID !== undefined, 'the CLI parser requires a definition ID');
  invariant(keep === 'nixie' || keep === 'repo', 'the CLI parser requires --keep nixie or repo');

  const socketPath = await host.resolveSocketPath(flags.config);

  const resolved = await host.sendHostRequest(socketPath, 'definitions resolve', (client) =>
    client.definitions.resolve({ definitionID, keep }),
  );

  io.print(JSON.stringify(resolved));

  return 0;
}
