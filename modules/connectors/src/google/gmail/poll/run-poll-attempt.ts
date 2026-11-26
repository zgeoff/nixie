import { toErrorFields } from '@heynixie/logger';
import { buildPollRetryMs } from './build-poll-retry-ms';
import { GmailPollError } from './gmail-poll-error';
import { runConnectionPoll } from './run-connection-poll';
import type { GmailConnection, PollRun, PollState } from './types';

// One poll of one connection, and the bookkeeping of its outcome: a success resets the failures and
// sets the next poll one interval on; a failure doubles the wait, or takes Google's own retry time
// when that is longer. A poll that a stop cut short counts as neither.
export async function runPollAttempt(
  run: PollRun,
  connection: GmailConnection,
  state: PollState,
): Promise<void> {
  const startedAt = run.input.clock.now();

  try {
    await runConnectionPoll(run, connection, startedAt);

    state.failures = 0;
    state.dueAt = startedAt + run.input.pollIntervalMs;
  } catch (error) {
    if (run.signal.aborted) {
      return;
    }

    state.failures += 1;

    const retryAfterMs = error instanceof GmailPollError ? error.retryAfterMs : null;
    const retryInMs = buildPollRetryMs(state.failures, retryAfterMs);

    state.dueAt = run.input.clock.now() + retryInMs;

    run.input.logEvent('gmail.poll_failed', {
      connection: connection.connection,
      failures: state.failures,
      retryInMs,
      ...toErrorFields(error),
    });
  }
}
