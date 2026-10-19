import { runSubjectMigrationDryRun } from '@heynixie/db';
import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

// memory-subjects prints how many memory items and proposals each subject holds, from the running
// server, or with --dry-run --database <path> what the subjects migration would do to a copy of
// that database file, such as a backup, before and after it runs.
export function buildSubjectCommands(): readonly (readonly [string, Command])[] {
  return [['memory-subjects', runMemorySubjects]];
}

async function runMemorySubjects(flags: CLIFlags, io: CLIIO): Promise<number> {
  if (flags['dry-run']) {
    return runDryRun(flags.database, io);
  }

  const socketPath = await resolveSocketPath(flags.config);

  const counts = await sendHostRequest(socketPath, 'memory subjects', (client) =>
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
