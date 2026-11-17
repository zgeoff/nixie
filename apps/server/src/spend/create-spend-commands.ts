import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createSpendCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [['spend raise', (flags, io) => runSpendRaise(host, flags, io)]];
}

async function runSpendRaise(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const turns = flags.turns;

  if (turns === undefined || !Number.isInteger(turns) || turns <= 0) {
    io.log('spend.raise_refused', {
      reason: 'spend raise takes --turns <n>, a whole number above 0',
    });

    return 1;
  }

  const socketPath = await host.resolveSocketPath(flags.config);

  const raised = await host.sendHostRequest(socketPath, 'spend raise', (client) =>
    client.spend.raise({ turns }),
  );

  io.print(JSON.stringify(raised));

  return 0;
}
