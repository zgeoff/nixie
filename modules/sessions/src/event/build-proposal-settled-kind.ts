import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { proposalsSettledCodec } from '@heynixie/proposals';
import { renderSettledLine } from '../inbox/render-proposal-settled';
import type { EventKind } from '../types';

export interface ProposalSettledEvent {
  readonly line: string;
}

const readLimit = 1000;

// The settlements of the proposals that the conversation made, one line each. An action's own
// outcome tells the proposer how it ended, and the proposer's own withdrawal is in its call's
// result, so neither is a line here.
export function buildProposalSettledKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
): EventKind<ProposalSettledEvent> {
  return {
    name: 'proposals_settled',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        thread,
        kinds: [proposalsSettledCodec.kind],
        limit: readLimit,
      });

      return records.flatMap((entry) => {
        const record = entry.record;
        const settled = proposalsSettledCodec.decode(record.payload);

        return settled.family === 'action' || settled.byProposer
          ? []
          : [
              {
                sequence: record.sequence,
                at: record.recordedAt.getTime(),
                detail: { line: renderSettledLine(record) },
              },
            ];
      });
    },
    render: (detail) => detail.line,
  };
}
