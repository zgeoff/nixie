import type { Clock } from '@heynixie/clock';
import type { JSONValue } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { toErrorFields } from '@heynixie/logger';
import type { MailArrivalEvent, TriggerContext, TriggerSource } from '@heynixie/triggers';
import type { ConnectorContext } from '../../../types';
import type { GoogleHosts } from '../../google-hosts';
import { readGmailMessage } from '../read-gmail-message';
import { buildGmailArrivalEvent } from './build-gmail-arrival-event';
import { buildPollRetryMs } from './build-poll-retry-ms';
import { GmailPollError } from './gmail-poll-error';
import type { GmailSourceCursor } from './gmail-source-cursor';
import { parseGmailSourceCursor } from './gmail-source-cursor';
import { readGmailAddedIDs } from './read-gmail-added-ids';
import { readGmailProfileHistoryID } from './read-gmail-profile-history-id';
import { readGmailRecentIDs } from './read-gmail-recent-ids';

export interface GmailConnection {
  readonly connectionID: string;

  // the short ID, the prefix of the IDs that a Gmail tool takes
  readonly connection: string;
  readonly status: 'active' | 'failing' | 'needs_consent' | 'expiring';
}

export interface GmailArrivalSourceInput {
  readonly clock: Clock;
  readonly hosts: GoogleHosts;
  readonly logEvent: Logger;
  readonly pollIntervalMs: number;

  // each Google connection granted gmail.modify, the scope the Gmail tools already hold; the source
  // asks for no scope of its own
  readonly listConnections: () => Promise<readonly GmailConnection[]>;

  // the connection's fetcher; null once the connection is no longer live
  readonly readContext: (connectionID: string) => Promise<ConnectorContext | null>;
}

// The trigger source of the Gmail mail of each Google connection. It polls each live connection,
// one at a time, reads the headers of each added message, and delivers one batch for each poll with
// the whole cursor. It only reads Gmail and never reaches the decision point.
export function buildGmailArrivalSource(input: GmailArrivalSourceInput): TriggerSource {
  let controller: AbortController | null = null;
  let loop: Promise<unknown> | null = null;

  return {
    id: 'gmail',
    kind: 'mail',
    start: (trigger) => {
      const running = new AbortController();

      controller = running;

      loop = runPollLoop({
        input,
        trigger,
        signal: AbortSignal.any([running.signal, trigger.signal]),
        cursor: parseGmailSourceCursor(trigger.cursor),
        states: new Map(),
      });

      return Promise.resolve();
    },
    stop: async () => {
      controller?.abort();

      await loop;
    },
  };
}

interface PollState {
  failures: number;

  // epoch ms when the connection's next poll falls due
  dueAt: number;
}

interface Run {
  readonly input: GmailArrivalSourceInput;
  readonly trigger: TriggerContext;
  readonly signal: AbortSignal;
  cursor: GmailSourceCursor;
  readonly states: Map<string, PollState>;
}

async function runPollLoop(run: Run): Promise<void> {
  while (!run.signal.aborted) {
    let waitMs = run.input.pollIntervalMs;

    try {
      waitMs = await runPollCycle(run);
    } catch (error) {
      run.input.logEvent('gmail.source_failed', toErrorFields(error));
    }

    if (!run.signal.aborted) {
      await run.input.clock.sleep(waitMs, run.signal).catch(() => {});
    }
  }
}

const minSleepMs = 1000;

// One pass over the connections that fall due. Returns how long to sleep until the next one does.
async function runPollCycle(run: Run): Promise<number> {
  const connections = await run.input.listConnections();

  await pruneForgotten(run, connections);

  const pollable = connections.filter((connection) => connection.status !== 'needs_consent');

  for (const connection of pollable) {
    if (run.signal.aborted) {
      break;
    }

    const state = run.states.get(connection.connectionID) ?? { failures: 0, dueAt: 0 };

    run.states.set(connection.connectionID, state);

    if (state.dueAt <= run.input.clock.now()) {
      await pollOne(run, connection, state);
    }
  }

  reportHealth(run);

  const now = run.input.clock.now();
  const dueAts = pollable.map((entry) => run.states.get(entry.connectionID)?.dueAt ?? now);
  const nextAt = dueAts.length === 0 ? now + run.input.pollIntervalMs : Math.min(...dueAts);

  return Math.max(minSleepMs, nextAt - now);
}

// Drops the cursor entry of each connection that the list no longer holds, in a delivery of its own,
// so a forgotten connection leaves nothing in the cursor even when no poll follows.
async function pruneForgotten(run: Run, connections: readonly GmailConnection[]): Promise<void> {
  const live = new Set(connections.map((connection) => connection.connectionID));

  for (const id of run.states.keys()) {
    if (!live.has(id)) {
      run.states.delete(id);
    }
  }

  const kept = Object.entries(run.cursor).filter(([id]) => live.has(id));

  if (kept.length === Object.keys(run.cursor).length) {
    return;
  }

  const pruned = Object.fromEntries(kept);

  await run.trigger.deliver({ cursor: toJSON(pruned), events: [] });

  run.cursor = pruned;
}

function toJSON(cursor: GmailSourceCursor): JSONValue {
  return Object.fromEntries(
    Object.entries(cursor).map(([id, entry]) => [
      id,
      { historyID: entry.historyID, polledAt: entry.polledAt },
    ]),
  );
}

async function pollOne(run: Run, connection: GmailConnection, state: PollState): Promise<void> {
  const startedAt = run.input.clock.now();

  try {
    await pollConnection(run, connection, startedAt);

    state.failures = 0;
    state.dueAt = startedAt + run.input.pollIntervalMs;
  } catch (error) {
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

// Reads the changes of one connection and delivers them with the cursor in one call. The cursor
// moves only when the delivery commits, so a failed poll reads the same changes again.
async function pollConnection(
  run: Run,
  connection: GmailConnection,
  startedAt: number,
): Promise<void> {
  const context = await run.input.readContext(connection.connectionID);

  if (context === null) {
    return;
  }

  const hosts = run.input.hosts;
  const entry = run.cursor[connection.connectionID];

  if (entry === undefined) {
    const historyID = await readGmailProfileHistoryID(hosts, context);

    await deliverPoll(run, connection, { historyID, startedAt, events: [] });

    return;
  }

  const added = await readGmailAddedIDs(hosts, context, entry.historyID);

  const [ids, historyID] =
    added.kind === 'added'
      ? ([added.ids, added.historyID] as const)
      : ([
          await readGmailRecentIDs(hosts, context, entry.polledAt),
          await readGmailProfileHistoryID(hosts, context),
        ] as const);

  const events: MailArrivalEvent[] = [];

  for (const id of ids) {
    const event = await readArrival(run, connection, context, id);

    if (event !== null) {
      events.push(event);
    }
  }

  await deliverPoll(run, connection, { historyID, startedAt, events });
}

interface PollDelivery {
  readonly historyID: string;
  readonly startedAt: number;
  readonly events: readonly MailArrivalEvent[];
}

async function deliverPoll(
  run: Run,
  connection: GmailConnection,
  delivery: PollDelivery,
): Promise<void> {
  const cursor = {
    ...run.cursor,
    [connection.connectionID]: { historyID: delivery.historyID, polledAt: delivery.startedAt },
  };

  await run.trigger.deliver({ cursor: toJSON(cursor), events: delivery.events });

  run.cursor = cursor;
}

async function readArrival(
  run: Run,
  connection: GmailConnection,
  context: ConnectorContext,
  id: string,
): Promise<MailArrivalEvent | null> {
  const read = await readGmailMessage(run.input.hosts, context, { id, format: 'metadata' });

  if (read.kind === 'missing') {
    return null;
  }

  if (read.kind === 'failed') {
    throw new GmailPollError(read.reason);
  }

  return buildGmailArrivalEvent({
    connectionID: connection.connectionID,
    connection: connection.connection,
    message: read.message,
    occurredAt: new Date(run.input.clock.now()).toISOString(),
  });
}

const unhealthyAfter = 3;

// The source reports unhealthy after 3 failed polls in a row of any connection, and running again
// once the last poll of every connection succeeded.
function reportHealth(run: Run): void {
  const failures = [...run.states.values()].map((state) => state.failures);

  if (failures.some((count) => count >= unhealthyAfter)) {
    run.trigger.reportHealth('unhealthy');
  } else if (failures.every((count) => count === 0)) {
    run.trigger.reportHealth('running');
  }
}
