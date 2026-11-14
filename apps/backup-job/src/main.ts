import { setTimeout } from 'node:timers/promises';
import type { Logger } from '@heynixie/logger';
import { makeLogger, startLineLog, toErrorFields } from '@heynixie/logger';
import { cli, define } from 'gunshi';
import { localFetchFiles } from './fetch/local-fetch-files';
import { readSnapshotLines } from './fetch/read-snapshot-lines';
import { runLoggedFetchOf } from './fetch/run-logged-fetch';
import { localJobFiles } from './local-job-files';
import type { JobConfig } from './parse-job-config';
import { parseJobConfig } from './parse-job-config';
import type { BackupRepos } from './publish/publish-backup-set';
import { buildResticClient } from './restic/build-restic-client';
import { runJobPass } from './run-job-pass';

const stopping = new AbortController();

process.once('SIGTERM', () => {
  stopping.abort();
});

process.once('SIGINT', () => {
  stopping.abort();
});

await startLineLog((line) => {
  process.stdout.write(line);
});

const log = makeLogger();

const run = define({
  name: 'run',
  description: 'Publishes every complete set in staging once, then exits',
  run: async () => {
    process.exitCode = await runLoggedPass(parseJobConfig(process.env), log);
  },
});

const loop = define({
  name: 'loop',
  description: 'Publishes every complete set in staging, then waits and looks again, until stopped',
  run: async () => {
    const config = parseJobConfig(process.env);

    log('backup.loop_started', { pollMs: config.pollMs });

    while (!stopping.signal.aborted) {
      await runLoggedPass(config, log).catch((error: unknown) => {
        log('backup.pass_failed', toErrorFields(error), 'error');
      });

      await setTimeout(config.pollMs, undefined, { signal: stopping.signal }).catch(() => {});
    }
  },
});

const fetchPair = define({
  name: 'fetch',
  description: 'Copies the backup pair of the newest key snapshot into an empty directory',
  args: {
    to: { type: 'string', required: true, description: 'The empty directory for the pair' },
    'data-snapshot': {
      type: 'string',
      description: 'The full ID of the data snapshot to take, from the snapshots command',
    },
  },
  run: async (ctx) => {
    process.exitCode = await runLoggedFetchOf(() => {
      const config = parseJobConfig(process.env);

      return {
        repos: buildRepos(config),
        files: localFetchFiles,
        directory: ctx.values.to,
        dataSnapshotID: ctx.values['data-snapshot'] ?? null,
        now: Date.now,
      };
    }, log);
  },
});

const snapshots = define({
  name: 'snapshots',
  description: 'Prints one line of JSON for each snapshot of the data and key repositories',
  run: async () => {
    const lines = await readSnapshotLines(buildRepos(parseJobConfig(process.env)));

    for (const line of lines) {
      process.stdout.write(`${line}\n`);
    }
  },
});

try {
  await cli(process.argv.slice(2), run, {
    name: 'nixie-backup',

    // the snapshots command prints lines of JSON and nothing else
    renderHeader: null,
    subCommands: { run, loop, fetch: fetchPair, snapshots },
  });
} catch (error) {
  log('backup.job_failed', toErrorFields(error), 'error');

  process.exitCode = 1;
}

async function runLoggedPass(config: JobConfig, logger: Logger): Promise<number> {
  const pass = await runJobPass(config, buildRepos(config), localJobFiles);

  if (pass.status === 'locked') {
    logger('backup.pass_locked', { stagingDir: config.stagingDir });

    return 0;
  }

  const receipts = pass.receipts;

  for (const receipt of receipts) {
    if (receipt.status === 'published') {
      logger('backup.set_published', { sequence: receipt.sequence });
    } else {
      logger(
        'backup.set_failed',
        { sequence: receipt.sequence, failure: receipt.failure ?? '' },
        'error',
      );
    }
  }

  return receipts.some((receipt) => receipt.status === 'failed') ? 1 : 0;
}

function buildRepos(config: JobConfig): BackupRepos {
  return {
    data: buildResticClient(config, config.data, 'data'),
    keys: buildResticClient(config, config.keys, 'key'),
  };
}
