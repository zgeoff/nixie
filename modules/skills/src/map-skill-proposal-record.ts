import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import { skillsWriteApprovedCodec } from './skills-write-approved-codec';
import { skillsWriteLapsedCodec } from './skills-write-lapsed-codec';
import { skillsWriteProposedCodec } from './skills-write-proposed-codec';
import { skillsWriteRejectedCodec } from './skills-write-rejected-codec';

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
    return {
      type: 'close',
      proposalID: skillsWriteApprovedCodec.decode(record.payload).proposalID,
      state: 'approved',
      usedBy: null,
    };
  }

  if (record.kind === skillsWriteRejectedCodec.kind) {
    return {
      type: 'close',
      proposalID: skillsWriteRejectedCodec.decode(record.payload).proposalID,
      state: 'declined',
      usedBy: null,
    };
  }

  if (record.kind === skillsWriteLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: skillsWriteLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
    };
  }

  return null;
}
