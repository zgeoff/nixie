import type { EnvelopeRecord } from '@heynixie/log';
import type { ClosedProposalState, ProposalChange } from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import { z } from 'zod';
import { rulesChangeApprovedCodec } from '../change/rules-change-approved-codec';
import { rulesChangeLapsedCodec } from '../change/rules-change-lapsed-codec';
import { rulesChangeRejectedCodec } from '../change/rules-change-rejected-codec';
import { ruleProposalSchema } from '../utils/rule-proposal-schema';
import { rulesChangeWithdrawnCodec } from '../utils/rules-change-withdrawn-codec';

const closedSchema = z.object({ proposalID: z.string(), identityID: z.string().optional() });

const closingCodecs = [
  [rulesChangeApprovedCodec, 'approved'],
  [rulesChangeRejectedCodec, 'declined'],
  [rulesChangeLapsedCodec, 'lapsed'],
  [rulesChangeWithdrawnCodec, 'withdrawn'],
] as const satisfies readonly (readonly [{ readonly kind: string }, ClosedProposalState])[];

export function mapRuleProposalRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === 'rules.change_proposed') {
    const proposed = ruleProposalSchema.parse(record.payload);

    return {
      type: 'create',
      proposal: {
        id: proposed.proposalID,
        shortID: proposed.proposalID,
        family: 'rule_change',
        kind: 'internal_change',
        riskClass: proposed.riskClass ?? 'routine',
        actionHash: proposed.proposalHash,
        ruleHash: null,
        cause: 'rule_widening',
        taskID: null,
        lapsesAt: record.recordedAt.getTime() + proposalLapseMs,
        deadlineAt: null,
      },
    };
  }

  for (const [codec, state] of closingCodecs) {
    if (record.kind === codec.kind) {
      const closed = closedSchema.parse(record.payload);

      return {
        type: 'close',
        proposalID: closed.proposalID,
        state,
        usedBy: null,
        answeredBy: closed.identityID ?? null,
      };
    }
  }

  return null;
}
