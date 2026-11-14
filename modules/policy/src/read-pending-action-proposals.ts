import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { readProposalLapses } from '@heynixie/proposals';
import { z } from 'zod';
import { actionProposalLapseMs } from './action-proposal-lapse-ms';
import type { ActionProposalState } from './read-action-proposals';
import { readActionProposals } from './read-action-proposals';

export interface PendingActionProposal extends ActionProposalState {
  readonly destinations: readonly string[];
  readonly lapseAt: number;
}

// A proposal that a forget erased still lists, with no destinations.
export async function readPendingActionProposals(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  now: number,
): Promise<readonly PendingActionProposal[]> {
  const proposals = await readActionProposals(log.writer.db);

  // A defer moves a lapse, so the shared row holds the time that counts.
  const lapses = await readProposalLapses(
    log.writer.db,
    proposals.map((entry) => entry.proposalID),
  );

  const lapseOf = (entry: ActionProposalState): number =>
    lapses.get(entry.proposalID) ?? entry.proposedAt + actionProposalLapseMs;

  const pending = proposals.filter((entry) => entry.outcome === null && lapseOf(entry) > now);

  if (pending.length === 0) {
    return [];
  }

  const records = await readRecords(log, {
    afterSequence: 0,
    sequences: pending.map((entry) => entry.sequence),
    limit: pending.length,
  });

  const destinations = new Map(
    records.map((read) => [read.record.sequence, listDestinations(read.record)]),
  );

  return pending.map((entry) => ({
    sequence: entry.sequence,
    proposalID: entry.proposalID,
    shortID: entry.shortID,
    thread: entry.thread,
    callSequence: entry.callSequence,
    tool: entry.tool,
    effects: entry.effects,
    cause: entry.cause,
    proposedAt: entry.proposedAt,
    outcome: entry.outcome,
    destinations: destinations.get(entry.sequence) ?? [],
    lapseAt: lapseOf(entry),
  }));
}

const erasableSchema = z.object({
  destinations: z.object({ value: z.string() }).array().default([]),
});

function listDestinations(record: LogRecord): readonly string[] {
  if (record.erasable.status !== 'readable') {
    return [];
  }

  const fields = erasableSchema.parse(record.erasable.fields);

  return fields.destinations.map((destination) => destination.value);
}
