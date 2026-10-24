import { runSubjectMigrationDryRun } from '@heynixie/db';
import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createSubjectCommands(
  host: HostTransport,
): readonly (readonly [string, Command])[] {
  return [['memory-subjects', (flags, io) => runMemorySubjects(host, flags, io)]];
}

async function runMemorySubjects(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  if (flags['dry-run']) {
    return runDryRun(flags.database, io);
  }

  const socketPath = await host.resolveSocketPath(flags.config);

  const counts = await host.sendHostRequest(socketPath, 'memory subjects', (client) =>
    client.memory.subjects(),
  );

  io.print(JSON.stringify(counts));

  return 0;
}

async function runDryRun(database: string | undefined, io: CLIIO): Promise<number> {
  if (database === undefined || database === '') {
    io.print('nixie memory-subjects --dry-run takes --database <path> of a nixie.db to copy');

    return 2;
  }

  const report = await runSubjectMigrationDryRun(database);

  io.print(JSON.stringify(report));

  return 0;
}
