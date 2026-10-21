import { resolveSocketPath } from './resolve-socket-path';
import { sendHostRequest } from './send-host-request';
import type { CLIFlags, CLIIO, Command } from './types';

export function buildResetCommands(): readonly (readonly [string, Command])[] {
  return [['reset', runReset]];
}

const backupNote = 'Backups from before the reset still hold the old data until they age out.';

const resetWarning = [
  'A reset removes every record, every memory, the conversation and every sandbox, and keeps the device sessions that are signed in now.',
  'Only a restore from a backup undoes it.',
  backupNote,
].join('\n');

async function runReset(flags: CLIFlags, io: CLIIO): Promise<number> {
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

  const socketPath = await resolveSocketPath(flags.config);
  const reset = await sendHostRequest(socketPath, 'reset', (client) => client.reset());

  io.print(
    [
      `nixie removed the log up to sequence ${reset.lastSequence} at ${reset.resetAt.toISOString()} and kept ${reset.keptSessions} device sessions signed in.`,
      'The server restarts now, and its next turn starts with no history.',
      backupNote,
    ].join('\n'),
  );

  return 0;
}
