import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import { skillsWriteApprovedCodec } from '../write/skills-write-approved-codec';
import { skillsWriteLapsedCodec } from '../write/skills-write-lapsed-codec';
import { skillsWriteProposedCodec } from '../write/skills-write-proposed-codec';
import { skillsWriteRejectedCodec } from '../write/skills-write-rejected-codec';

export function mapSkillProposalRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === skillsWriteProposedCodec.kind) {
    const proposed = skillsWriteProposedCodec.decode(record.payload);

    return {
      type: 'create',
      proposal: {
        id: proposed.proposalID,
        shortID: proposed.proposalID,
        family: 'skill',
        kind: 'internal_change',
        riskClass: 'routine',
        actionHash: proposed.skillHash,
        ruleHash: null,
        cause: 'skill_write',
        taskID: null,
        lapsesAt: record.recordedAt.getTime() + proposalLapseMs,
        deadlineAt: null,
      },
    };
  }

  if (record.kind === skillsWriteApprovedCodec.kind) {
    const approved = skillsWriteApprovedCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: approved.proposalID,
      state: 'approved',
      usedBy: null,
      answeredBy: approved.identityID ?? null,
    };
  }

  if (record.kind === skillsWriteRejectedCodec.kind) {
    const rejected = skillsWriteRejectedCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: rejected.proposalID,
      state: 'declined',
      usedBy: null,
      answeredBy: rejected.identityID ?? null,
    };
  }

  if (record.kind === skillsWriteLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: skillsWriteLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
      answeredBy: null,
    };
  }

  return null;
}
