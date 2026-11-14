import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { actionAnsweredCodec } from './action-answered-codec';
import { actionLapsedCodec } from './action-lapsed-codec';
import { actionProposalLapseMs } from './action-proposal-lapse-ms';
import { actionProposedCodec } from './action-proposed-codec';

export function mapActionProposalRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === actionProposedCodec.kind) {
    const proposed = actionProposedCodec.decode(record.payload);

    return {
      type: 'create',
      proposal: {
        id: proposed.proposalID,
        shortID: proposed.shortID,
        family: 'action',
        kind: 'action',
        riskClass:
          proposed.riskClass ?? (proposed.cause === 'always_ask' ? 'always_ask' : 'routine'),
        actionHash: proposed.actionHash,
        ruleHash: proposed.rule?.hash ?? null,
        cause: proposed.cause,
        taskID: proposed.taskID ?? null,
        lapsesAt: proposed.lapsesAt ?? record.recordedAt.getTime() + actionProposalLapseMs,
        deadlineAt: proposed.deadlineAt ?? null,
      },
    };
  }

  if (record.kind === actionAnsweredCodec.kind) {
    const answered = actionAnsweredCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: answered.proposalID,
      state: answered.answer,
      usedBy: null,
    };
  }

  if (record.kind === actionLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: actionLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
    };
  }

  return null;
}
