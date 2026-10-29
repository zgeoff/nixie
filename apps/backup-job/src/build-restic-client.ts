import { parseJSONOrNull } from '@heynixie/wire';
import { z } from 'zod';
import type { DataRetention, JobConfig, ResticRepository } from './parse-job-config';
import { ResticError } from './restic-error';
import type { ResticRun } from './run-restic';
import { runRestic } from './run-restic';

export interface ResticClient {
  readonly createRepository: () => Promise<void>;
  readonly writeSnapshot: (path: string, name: string, tags: readonly string[]) => Promise<string>;
  readonly readSnapshotIDs: () => Promise<readonly string[]>;
  readonly removeSnapshots: (snapshotIDs: readonly string[]) => Promise<void>;
  readonly runRetention: (retention: DataRetention) => Promise<void>;
  readonly runPrune: () => Promise<void>;
  readonly runCheck: () => Promise<void>;
}

// restic 0.17 and later exit 10 when the repository does not exist, and 12 on a wrong password
const missingRepositoryExit = 10;

// One host for every snapshot, so a pod's changing host name never splits retention into groups.
const snapshotHost = 'nixie';
const summarySchema = z.object({ message_type: z.literal('summary'), snapshot_id: z.string() });
const snapshotsSchema = z.array(z.object({ id: z.string() }));

export function buildResticClient(
  config: Pick<JobConfig, 'restic' | 'backendEnv'>,
  repository: ResticRepository,
  label: string,
): ResticClient {
  const run = async (args: readonly string[], stdin?: string): Promise<ResticRun> => {
    const result = await runRestic(config, repository, {
      args,
      ...(stdin === undefined ? {} : { stdin }),
    });

    return result;
  };

  const requireSuccess = (step: string, result: ResticRun): void => {
    if (result.exitCode !== 0) {
      throw new ResticError(
        `restic ${step} in the ${label} repo exited ${String(result.exitCode)}: ${result.stderr.trim()}`,
      );
    }
  };

  return {
    createRepository: async () => {
      const probe = await run(['cat', 'config']);

      if (probe.exitCode === 0) {
        return;
      }

      if (probe.exitCode !== missingRepositoryExit) {
        requireSuccess('cat config', probe);
      }

      const init = await run(['init']);

      requireSuccess('init', init);
    },
    writeSnapshot: async (path, name, tags) => {
      const result = await run(
        [
          'backup',
          '--json',
          '--host',
          snapshotHost,
          '--stdin',
          '--stdin-filename',
          name,
          ...tags.flatMap((tag) => ['--tag', tag]),
        ],
        path,
      );

      requireSuccess(`backup of ${name}`, result);

      const summary = result.stdout
        .split('\n')
        .map((line) => summarySchema.safeParse(parseJSONOrNull(line)))
        .find((parsed) => parsed.success);

      if (summary?.data === undefined) {
        throw new ResticError(`restic backup of ${name} in the ${label} repo printed no summary`);
      }

      return summary.data.snapshot_id;
    },
    readSnapshotIDs: async () => {
      const result = await run(['snapshots', '--json']);

      requireSuccess('snapshots', result);

      return snapshotsSchema.parse(parseJSONOrNull(result.stdout)).map((snapshot) => snapshot.id);
    },
    removeSnapshots: async (snapshotIDs) => {
      if (snapshotIDs.length === 0) {
        return;
      }

      const forget = await run(['forget', ...snapshotIDs]);

      requireSuccess('forget', forget);
    },
    runRetention: async (retention) => {
      const result = await run([
        'forget',
        '--group-by',
        '',
        '--keep-hourly',
        String(retention.hourly),
        '--keep-daily',
        String(retention.daily),
        '--keep-weekly',
        String(retention.weekly),
        '--keep-monthly',
        String(retention.monthly),
        '--prune',
      ]);

      requireSuccess('forget with retention', result);
    },
    runPrune: async () => {
      const prune = await run(['prune', '--max-unused', '0']);

      requireSuccess('prune', prune);
    },
    runCheck: async () => {
      const check = await run(['check', '--read-data']);

      requireSuccess('check', check);
    },
  };
}
