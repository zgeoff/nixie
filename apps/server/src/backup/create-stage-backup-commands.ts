import type { CLIFlags, CLIIO, Command, HostTransport } from '../types';

export function createStageBackupCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [['stage-backup', (flags, io) => runStageBackup(host, flags, io)]];
}

async function runStageBackup(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  const socketPath = await host.resolveSocketPath(flags.config);

  const staged = await host.sendHostRequest(socketPath, 'backups stage', (client) =>
    client.backups.stage(),
  );

  io.print(
    `nixie staged backup set ${staged.sequence} (${staged.kind}); the backup job's next run ships it`,
  );

  return 0;
}
