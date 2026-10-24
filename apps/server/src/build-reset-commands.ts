import type { HostContractClient } from '@heynixie/contract';
import type { CLIFlags, CLIIO, Command } from './types';

export interface ResetCommandParts {
  readonly resolveSocketPath: (configPath: string) => Promise<string>;

  readonly sendHostRequest: <T>(
    socketPath: string,
    name: string,
    call: (client: HostContractClient) => Promise<T>,
  ) => Promise<T>;
}

export function buildResetCommands(
  parts: ResetCommandParts,
): readonly (readonly [string, Command])[] {
  return [['reset', makeResetCommand(parts)]];
}

function makeResetCommand(parts: ResetCommandParts): Command {
  return (flags, io) => runReset(parts, flags, io);
}

const backupNote = 'Backups from before the reset still hold the old data until they age out.';

const resetWarning = [
  'A reset removes every record, every memory, the conversation and every sandbox, and keeps the device sessions that are signed in now.',
  'Only a restore from a backup undoes it.',
  backupNote,
].join('\n');

async function runReset(parts: ResetCommandParts, flags: CLIFlags, io: CLIIO): Promise<number> {
  if (flags.only === 'memories') {
    return runMemoriesReset(parts, flags, io);
  }

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

  const socketPath = await parts.resolveSocketPath(flags.config);
  const reset = await parts.sendHostRequest(socketPath, 'reset', (client) => client.reset());

  io.print(
    [
      `nixie removed the log up to sequence ${reset.lastSequence} at ${reset.resetAt.toISOString()} and kept ${reset.keptSessions} device sessions signed in.`,
      'The server restarts now, and its next turn starts with no history.',
      backupNote,
    ].join('\n'),
  );

  return 0;
}

const memoriesWarning = [
  'A reset of the memories forgets every memory item, and keeps every record, the conversation and the device sessions.',
  'Only a restore from a backup undoes it.',
  backupNote,
].join('\n');

async function runMemoriesReset(
  parts: ResetCommandParts,
  flags: CLIFlags,
  io: CLIIO,
): Promise<number> {
  if (!flags.yes) {
    io.print(`${memoriesWarning}\nRun nixie reset --only memories --yes to reset.`);

    return 2;
  }

  const socketPath = await parts.resolveSocketPath(flags.config);

  const forgotten = await parts.sendHostRequest(socketPath, 'memory reset', (client) =>
    client.memory.items.forgetAll(),
  );

  io.print(`nixie forgot ${forgotten.itemIDs.length} memory items.\n${backupNote}`);

  return 0;
}
