import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { ruleAnsweredCodec } from './rule-answered-codec';
import { ruleLapsedCodec } from './rule-lapsed-codec';
import { ruleProposedCodec } from './rule-proposed-codec';

// the lapse that every record written before the config set one carried
const legacyLapseMs = 14 * 24 * 60 * 60 * 1000;

export function mapProposedRuleRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === ruleProposedCodec.kind) {
    const proposed = ruleProposedCodec.decode(record.payload);

    return {
      type: 'create',
      proposal: {
        id: proposed.proposalID,
        shortID: proposed.shortID,
        family: 'rule_change',
        kind: 'internal_change',
        riskClass: proposed.riskClass,
        actionHash: proposed.actionHash,
        ruleHash: null,
        cause: 'proposed_rule',
        taskID: null,
        lapsesAt: record.recordedAt.getTime() + legacyLapseMs,
        deadlineAt: null,
      },
    };
  }

  if (record.kind === ruleAnsweredCodec.kind) {
    const answered = ruleAnsweredCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: answered.proposalID,
      state: answered.answer === 'approved' ? 'approved' : 'declined',
      usedBy: answered.ruleID ?? null,
      answeredBy: answered.identityID ?? null,
    };
  }

  if (record.kind === ruleLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: ruleLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
      answeredBy: null,
    };
  }

  return null;
}
