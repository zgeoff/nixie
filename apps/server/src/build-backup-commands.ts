import {
  WriterLockHeldError,
  localDataStorage,
  restoreDataBackup,
  writeDataBackup,
} from '@heynixie/log';
import { loadDeploymentConfig } from './load-deployment-config';
import type { CLIFlags, CLIIO, Command } from './types';

export function buildBackupCommands(): readonly (readonly [string, Command])[] {
  return [
    ['backup', runBackup],
    ['restore', runRestore],
  ];
}

async function runBackup(flags: CLIFlags, io: CLIIO): Promise<number> {
  if (flags.to === undefined || flags.to === '') {
    io.print('nixie backup takes --to <directory>, a new directory to copy the data into');

    return 2;
  }

  const config = await loadDeploymentConfig(flags.config);

  const backup = await writeDataBackup({
    storage: localDataStorage,
    dataDir: config.server.dataDir,
    directory: flags.to,
    onCopied: (file) => {
      io.print(`copied ${file}`);
    },
  });

  if ('refused' in backup) {
    io.print(
      `a restore runs on the data directory ${config.server.dataDir}, so nixie backs up nothing`,
    );

    return 1;
  }

  io.print(
    `nixie backed up ${backup.files.join(' and ')} into ${flags.to} in ${String(backup.attempts)} ${backup.attempts === 1 ? 'copy' : 'copies'}`,
  );

  return 0;
}

const restoreWarning =
  'A restore replaces nixie.db and keys.db in the data directory with the backup, and the data written since the backup is lost.';

async function runRestore(flags: CLIFlags, io: CLIIO): Promise<number> {
  if (flags.from === undefined || flags.from === '') {
    io.print('nixie restore takes --from <directory>, a directory that nixie backup wrote');

    return 2;
  }

  if (!flags.yes) {
    io.print(`${restoreWarning}\nRun nixie restore --from ${flags.from} --yes to restore.`);

    return 2;
  }

  const config = await loadDeploymentConfig(flags.config);

  try {
    const restore = await restoreDataBackup({
      storage: localDataStorage,
      dataDir: config.server.dataDir,
      directory: flags.from,
    });

    if ('refused' in restore) {
      io.print(
        `a backup runs on the data directory ${config.server.dataDir}, so nixie restores nothing`,
      );

      return 1;
    }

    io.print(`nixie restored ${restore.files.join(' and ')} from ${flags.from}`);

    return 0;
  } catch (error) {
    if (!(error instanceof WriterLockHeldError)) {
      throw error;
    }

    io.print(
      'nixie restore runs only while the server is stopped, and another nixie process holds the data directory',
    );

    return 1;
  }
}
