import { isGmailPolled } from './is-gmail-polled';
import { pickPollSleepMs } from './pick-poll-sleep-ms';
import { reportPollHealth } from './report-poll-health';
import { runPollAttempt } from './run-poll-attempt';
import type { PollRun } from './types';
import { writePrunedCursor } from './write-pruned-cursor';

// One pass over the connections that fall due. Returns how long to sleep until the next pass.
export async function runPollCycle(run: PollRun): Promise<number> {
  const connections = await run.input.listConnections();

  await writePrunedCursor(run, connections);

  const pollable = connections.filter((connection) => isGmailPolled(connection));

  for (const connection of pollable) {
    if (run.signal.aborted) {
      break;
    }

    const state = run.states.get(connection.connectionID) ?? { failures: 0, dueAt: 0 };

    run.states.set(connection.connectionID, state);

    if (state.dueAt <= run.input.clock.now()) {
      await runPollAttempt(run, connection, state);
    }
  }

  const states = pollable.flatMap((connection) => run.states.get(connection.connectionID) ?? []);

  reportPollHealth(run, states);

  return pickPollSleepMs({
    nowMs: run.input.clock.now(),
    pollIntervalMs: run.input.pollIntervalMs,
    dueAts: states.map((state) => state.dueAt),
  });
}
