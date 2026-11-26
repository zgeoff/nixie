import type { ProposalBody, ProposalKindHandler, SharedProposal } from '@heynixie/proposals';

type RuleChangeCause = 'rule_widening' | 'proposed_rule' | 'mandate';

export type RuleChangeHandlers = Readonly<Record<RuleChangeCause, ProposalKindHandler>>;

// Every rule change shares one family, so the proposals table keeps its family check and the release
// before still reads it. The row's cause picks the handler, and with it the lapse.
export function makeRuleChangeHandler(handlers: RuleChangeHandlers): ProposalKindHandler {
  const pickHandler = (row: Pick<SharedProposal, 'cause'>): ProposalKindHandler =>
    isRuleChangeCause(row.cause) ? handlers[row.cause] : handlers.rule_widening;

  return {
    family: 'rule_change',
    lapseIntervalMs: (config, cause) =>
      isRuleChangeCause(cause) ? handlers[cause].lapseIntervalMs(config, cause) : null,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const bodies = new Map<string, ProposalBody | null>();

      for (const handler of new Set(rows.map((row) => pickHandler(row)))) {
        const read = await handler.readBodies(
          db,
          rows.filter((row) => pickHandler(row) === handler),
        );

        for (const [id, body] of read) {
          bodies.set(id, body);
        }
      }

      return bodies;
    },
    readHashes: (db, row) => pickHandler(row).readHashes(db, row),
    approve: (run, row, answer) => pickHandler(row).approve(run, row, answer),
    discard: (run, row, outcome, answer) => pickHandler(row).discard(run, row, outcome, answer),
  };
}

function isRuleChangeCause(cause: string): cause is RuleChangeCause {
  return cause === 'rule_widening' || cause === 'proposed_rule' || cause === 'mandate';
}
