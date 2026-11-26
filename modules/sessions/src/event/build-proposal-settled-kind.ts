import type { Log, RecordWithChanges } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { proposalsSettledCodec } from '@heynixie/proposals';
import { renderSettledLine } from '../inbox/render-proposal-settled';
import type { EventKind } from '../types';

export interface ProposalSettledEvent {
  readonly line: string;
}

// The settlements of the proposals that the conversation made, one line each. An action's own
// outcome tells the proposer how it ended, and the proposer's own withdrawal is in its call's
// result, so neither is a line here.
export function buildProposalSettledKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
): EventKind<ProposalSettledEvent> {
  return {
    name: 'proposals_settled',

    // a settlement is one the owner's answer made, so none of them drops past the cap
    isUncapped: true,
    read: async (range) => {
      const entries = await readSettlements(log, thread, range);

      return entries.flatMap((entry) => {
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

const readLimit = 1000;

interface SettlementRange {
  readonly after: number;
  readonly through: number;
}

// Every settlement through the turn's boundary, a page at a time, so none past the first page drops.
async function readSettlements(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
  range: SettlementRange,
): Promise<readonly RecordWithChanges[]> {
  const entries: RecordWithChanges[] = [];
  let after = range.after;

  for (;;) {
    const page = await readRecords(log, {
      afterSequence: after,
      beforeSequence: range.through + 1,
      thread,
      kinds: [proposalsSettledCodec.kind],
      limit: readLimit,
    });

    entries.push(...page);

    const last = page.at(-1);

    if (last === undefined || page.length < readLimit) {
      return entries;
    }

    after = last.record.sequence;
  }
}
