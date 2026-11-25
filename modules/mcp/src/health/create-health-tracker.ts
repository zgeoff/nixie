import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { mcpHealthChangedCodec } from '../record/mcp-health-changed-codec';
import type { McpContext } from '../types';
import { planHealth } from './plan-health';
import type { HealthChange, ListingOutcome } from './plan-health';
import { initialHealth } from './types';
import type { ServerHealth } from './types';

export interface HealthTracker {
  readonly read: (serverID: string) => ServerHealth;

  // Folds one server listing into the server's health, writes the record it owes, and schedules the
  // next try of a failed server.
  readonly record: (serverID: string, outcome: ListingOutcome) => Promise<ServerHealth>;

  // Resets every health state, and writes a recovery record for each server whose last health
  // record said unhealthy.
  readonly start: () => Promise<void>;

  readonly stop: () => void;
}

// The health of every server, in memory and shared by every task run. A failed server lists again
// on its backoff with no task run waiting on it, through `listAgain`.
export function createHealthTracker(
  context: McpContext,
  listAgain: (serverID: string) => Promise<unknown>,
): HealthTracker {
  const states = new Map<string, ServerHealth>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTimer = (serverID: string) => {
    const timer = timers.get(serverID);

    if (timer !== undefined) {
      clearTimeout(timer);

      timers.delete(serverID);
    }
  };

  const tryListAgain = async (serverID: string) => {
    try {
      await listAgain(serverID);
    } catch {
      // the next failed listing schedules the next try
    }
  };

  const schedule = (serverID: string, nextTryAtMs: number | null) => {
    clearTimer(serverID);

    if (nextTryAtMs === null) {
      return;
    }

    const timer = setTimeout(
      () => {
        timers.delete(serverID);
        void tryListAgain(serverID);
      },
      Math.max(0, nextTryAtMs - context.now()),
    );

    timer.unref();
    timers.set(serverID, timer);
  };

  return {
    read: (serverID) => states.get(serverID) ?? initialHealth,
    record: async (serverID, outcome) => {
      const plan = planHealth(states.get(serverID) ?? initialHealth, outcome, context.now());

      states.set(serverID, plan.next);

      schedule(serverID, plan.next.nextTryAtMs);

      if (plan.change !== null) {
        await writeHealthChange(context, serverID, plan.change);
      }

      return plan.next;
    },
    start: async () => {
      states.clear();

      for (const serverID of await readUnhealthyServers(context)) {
        await writeHealthChange(context, serverID, {
          isUnhealthy: false,
          lastError: null,
          nextTryAtMs: null,
        });
      }
    },
    stop: () => {
      for (const serverID of timers.keys()) {
        clearTimer(serverID);
      }
    },
  };
}

function writeHealthChange(
  context: McpContext,
  serverID: string,
  change: HealthChange,
): Promise<void> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpHealthChangedCodec.kind,
        definitions: context.definitions(),
        payload: mcpHealthChangedCodec.encode({
          serverID,
          isUnhealthy: change.isUnhealthy,
          lastError: change.lastError,
          nextTryAt: change.nextTryAtMs,
        }),
      },
    ]);
  });
}

async function readUnhealthyServers(context: McpContext): Promise<readonly string[]> {
  const records = await readRecords(context.log, {
    afterSequence: 0,
    kinds: [mcpHealthChangedCodec.kind],
  });

  const last = new Map<string, boolean>();

  for (const entry of records) {
    const payload = mcpHealthChangedCodec.decode(entry.record.payload);

    last.set(payload.serverID, payload.isUnhealthy);
  }

  return [...last].filter(([, isUnhealthy]) => isUnhealthy).map(([serverID]) => serverID);
}
