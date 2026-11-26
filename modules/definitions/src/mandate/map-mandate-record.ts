import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { mandateDeclinedCodec } from './mandate-declined-codec';
import { mandateLapsedCodec } from './mandate-lapsed-codec';
import { mandateProposedCodec } from './mandate-proposed-codec';
import { mandateStartedCodec } from './mandate-started-codec';

export function mapMandateRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === mandateProposedCodec.kind) {
    const proposed = mandateProposedCodec.decode(record.payload);

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
        cause: 'mandate',
        taskID: null,
        lapsesAt: proposed.expires,
        deadlineAt: proposed.expires,
      },
    };
  }

  if (record.kind === mandateStartedCodec.kind) {
    const started = mandateStartedCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: started.proposalID,
      state: 'approved',
      usedBy: started.mandateID,
      answeredBy: started.identityID ?? null,
    };
  }

  if (record.kind === mandateDeclinedCodec.kind) {
    const declined = mandateDeclinedCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: declined.proposalID,
      state: 'declined',
      usedBy: null,
      answeredBy: declined.identityID ?? null,
    };
  }

  if (record.kind === mandateLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: mandateLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
      answeredBy: null,
    };
  }

  return null;
}
