import { setTimeout } from 'node:timers/promises';
import type { Logger } from '@heynixie/logger';
import { makeLogger, startLineLog, toErrorFields } from '@heynixie/logger';
import { cli, define } from 'gunshi';
import { buildResticClient } from './build-restic-client';
import { localJobFiles } from './local-job-files';
import type { JobConfig } from './parse-job-config';
import { parseJobConfig } from './parse-job-config';
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

try {
  await cli(process.argv.slice(2), run, { name: 'nixie-backup', subCommands: { run, loop } });
} catch (error) {
  log('backup.job_failed', toErrorFields(error), 'error');

  process.exitCode = 1;
}

async function runLoggedPass(config: JobConfig, logger: Logger): Promise<number> {
  const repos = {
    data: buildResticClient(config, config.data, 'data'),
    keys: buildResticClient(config, config.keys, 'key'),
  };

  const receipts = await runJobPass(config, repos, localJobFiles);

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
