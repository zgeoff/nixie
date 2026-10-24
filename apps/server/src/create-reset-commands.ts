import type { CLIFlags, CLIIO, Command, HostTransport } from './types';

export function createResetCommands(host: HostTransport): readonly (readonly [string, Command])[] {
  return [['reset', (flags, io) => runReset(host, flags, io)]];
}

const backupNote = 'Backups from before the reset still hold the old data until they age out.';

const resetWarning = [
  'A reset removes every record, every memory, the conversation and every sandbox, and keeps the device sessions that are signed in now.',
  'Only a restore from a backup undoes it.',
  backupNote,
].join('\n');

async function runReset(host: HostTransport, flags: CLIFlags, io: CLIIO): Promise<number> {
  if (!flags['keep-sessions']) {
    io.print(
      `nixie reset runs only with --keep-sessions, which keeps every device that is signed in now signed in.\n${resetWarning}`,
    );

    return 2;
  }

  if (!flags.yes) {
    io.print(`${resetWarning}\nRun nixie reset --keep-sessions --yes to reset.`);

    return 2;
  }

  const socketPath = await host.resolveSocketPath(flags.config);
  const reset = await host.sendHostRequest(socketPath, 'reset', (client) => client.reset());

  io.print(
    [
      `nixie removed the log up to sequence ${reset.lastSequence} at ${reset.resetAt.toISOString()} and kept ${reset.keptSessions} device sessions signed in.`,
      'The server restarts now, and its next turn starts with no history.',
      backupNote,
    ].join('\n'),
  );

  return 0;
}
