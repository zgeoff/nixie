import type { APIContext, KeptSession } from '@heynixie/api';
import { readKeptSessions, writeKeptSessions } from '@heynixie/api';
import type { ResetSeed } from '@heynixie/definitions';
import { readResetSeed, writeResetSeed } from '@heynixie/definitions';
import type { LogReset, LogResetOptions } from '@heynixie/log';
import { runLogReset, writeRecordsInTransaction } from '@heynixie/log';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

export interface ServerResetOptions {
  readonly context: APIContext;
  readonly adapter: StaleSandboxesOptions['adapter'];

  readonly stopWork: () => Promise<void>;
}

export interface ServerReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly keptSessions: number;
}

export async function runServerReset(options: ServerResetOptions): Promise<ServerReset> {
  if ((await readResetSeed(options.context.log.writer.db)) === null) {
    throw new Error('no definitions are in force yet, so the reset has nothing to start from');
  }

  await options.stopWork();

  // The agent CLI keeps the conversation's transcript on its sandbox's disk, so a kept sandbox
  // would resume it.
  await removeStaleSandboxes({
    log: options.context.log,
    adapter: options.adapter,
    keptOwners: [],
  });

  const kept = { sessions: 0 };

  const reset = await runLogReset(options.context.log, {
    keptTables: ['identities'],
    readKept: async (tx) => ({
      seed: await readResetSeed(tx),
      sessions: await readKeptSessions(tx, options.context),
    }),
    writeFirstRecords: async (tx, read, logReset) => {
      kept.sessions = read.sessions.length;

      await writeFirstRecords(tx, options.context, { ...read, reset: logReset });
    },
  });

  return { ...reset, keptSessions: kept.sessions };
}

type ResetTransaction = Parameters<LogResetOptions<unknown>['readKept']>[0];

interface FirstRecords {
  readonly seed: ResetSeed | null;
  readonly sessions: readonly KeptSession[];
  readonly reset: LogReset;
}

async function writeFirstRecords(
  tx: ResetTransaction,
  context: APIContext,
  first: FirstRecords,
): Promise<void> {
  invariant(first.seed);

  const inForce = await writeResetSeed(tx, context.log, first.seed);

  const definitions = { snapshotHash: inForce.snapshotHash };

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'log_reset',
      definitions,
      thread: conversationTaskID,
      payload: {
        resetAt: first.reset.resetAt.getTime(),
        lastSequence: first.reset.lastSequence,
        mode: 'full',
        keptSessions: first.sessions.length,
      },
    },
  ]);

  await writeKeptSessions(tx, context.log, { sessions: first.sessions, definitions });
}
