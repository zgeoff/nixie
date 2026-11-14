import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createPauseCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [
    ['pause', (flags, io) => runPause(host, flags, io)],
    ['resume', (flags, io) => runResume(host, flags, io)],
    ['recovery', (flags, io) => runRecovery(host, flags, io)],
  ];
}

async function runPause(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const paused = await host.sendHostRequest(socketPath, 'nixie pause', (client) =>
    client.nixie.pause(),
  );

  io.print(JSON.stringify(paused));

  return 0;
}

async function runResume(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const resumed = await host.sendHostRequest(socketPath, 'nixie resume', (client) =>
    client.nixie.resume(),
  );

  io.print(JSON.stringify(resumed));

  return 0;
}

async function runRecovery(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const recovery = await host.sendHostRequest(socketPath, 'recovery read', (client) =>
    client.recovery.read(),
  );

  io.print(JSON.stringify(recovery));

  return 0;
}
