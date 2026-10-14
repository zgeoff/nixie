import type { APIContext, KeptSession } from '@heynixie/api';
import { readKeptSessions, writeKeptSessions } from '@heynixie/api';
import type { ResetSeed } from '@heynixie/definitions';
import { findResetSeed, writeResetSeed } from '@heynixie/definitions';
import type { LogReset, LogResetOptions } from '@heynixie/log';
import { runLogReset, writeRecordsInTransaction } from '@heynixie/log';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { conversationTaskID } from '@heynixie/tasks';
import invariant from 'tiny-invariant';

export interface ServerResetOptions {
  readonly context: APIContext;
  readonly adapter: StaleSandboxesOptions['adapter'];

  // stops claiming work and gives the work in flight the stop grace
  readonly stopWork: () => Promise<void>;
}

export interface ServerReset {
  readonly resetAt: Date;
  readonly lastSequence: number;
  readonly keptSessions: number;
}

// The server's half of a reset under 0046: it stops the work, destroys every sandbox, then resets
// the log and keeps the live sessions. A failed destroy stops it before it removes anything, and a
// turn still running loses its lease row, so its commit writes nothing.
export async function runServerReset(options: ServerResetOptions): Promise<ServerReset> {
  if ((await findResetSeed(options.context.log.writer.db)) === null) {
    throw new Error('no definitions are in force yet, so the reset has nothing to start from');
  }
  await options.stopWork();

  // the conversation's transcript lives on its sandbox's disk, so a kept sandbox would resume it
  await removeStaleSandboxes({
    log: options.context.log,
    adapter: options.adapter,
    keptOwners: [],
  });

  const kept = { sessions: 0 };
  const reset = await runLogReset(options.context.log, {
    keptTables: ['identities'],
    readKept: async (tx) => ({
      seed: await findResetSeed(tx),
      sessions: await readKeptSessions(tx, options.context),
    }),
    writeFirstRecords: async (tx, read, logReset) => {
      kept.sessions = read.sessions.length;
      await writeFirstRecords(tx, options.context, { ...read, reset: logReset });
    },
  });

  return { ...reset, keptSessions: kept.sessions };
}

// the reset's write transaction, named from the log's options to keep Kysely out of the server
type ResetTransaction = Parameters<LogResetOptions<unknown>['readKept']>[0];

interface FirstRecords {
  readonly seed: ResetSeed | null;
  readonly sessions: readonly KeptSession[];
  readonly reset: LogReset;
}

// Every record names its definitions, so the seed comes first. The log_reset record holds no free
// text, so it gets no key.
async function writeFirstRecords(
  tx: ResetTransaction,
  context: APIContext,
  first: FirstRecords,
): Promise<void> {
  // the reset checked for a seed before it began, and nothing removes one outside a reset
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
