import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalConfig, ProposalKindHandler } from '../answer/proposal-kind-handler';
import type { ProposeDeps } from '../answer/types';
import type { ProposalFamily } from '../rows/proposal-tables';

export const defaultProposalConfig: ProposalConfig = {
  lapseDays: { action: 3, memory: 14, skill: 14, rule_change: 14, prompt: 14, mcp: 14 },
};

export interface ProposeDepsBase {
  readonly log: Log;
  readonly clock: Pick<Clock, 'now'>;
  readonly definitions: () => Definitions;
  readonly config?: ProposalConfig | undefined;

  // the handler of the family that proposes, which a replacement discards through
  readonly handler?: ProposalKindHandler | undefined;
}

// The deps of a family that proposes from its own tools. A settlement it writes lands on the
// proposer's own thread, and the conversation hears a lapse of a proposal with no proposer.
export function buildProposeDeps(base: ProposeDepsBase): ProposeDeps {
  const handlers: [ProposalFamily, ProposalKindHandler][] =
    base.handler === undefined ? [] : [[base.handler.family, base.handler]];

  return {
    log: base.log,
    clock: base.clock,
    definitions: base.definitions,
    config: base.config ?? defaultProposalConfig,
    handlers: new Map(handlers),
    conversationThread: 'conversation',
    readSettlementTarget: (_tx, thread) => Promise.resolve({ thread, task: null }),
    writeThreadRecord: async (tx, input) => {
      await writeRecordsInTransaction(tx, base.log, [input]);
    },
  };
}
