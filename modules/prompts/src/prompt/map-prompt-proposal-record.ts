import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { promptsOverrideApprovedCodec } from '../override/prompts-override-approved-codec';
import { promptsOverrideLapsedCodec } from '../override/prompts-override-lapsed-codec';
import { promptsOverrideProposedCodec } from '../override/prompts-override-proposed-codec';
import { promptsOverrideRejectedCodec } from '../override/prompts-override-rejected-codec';

// the lapse that every record written before the config set one carried
const legacyLapseMs = 14 * 24 * 60 * 60 * 1000;

// What each record of the prompt overrides means for the shared proposals row. An override always
// asks, so approving it takes a passkey. A migration folds the same records for a database that
// holds them already.
export function mapPromptProposalRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === promptsOverrideProposedCodec.kind) {
    const proposed = promptsOverrideProposedCodec.decode(record.payload);

    return {
      type: 'create',
      proposal: {
        id: proposed.proposalID,
        shortID: proposed.proposalID,
        family: 'prompt',
        kind: 'internal_change',
        riskClass: 'always_ask',
        actionHash: proposed.proposalHash,
        ruleHash: null,
        cause: 'prompt_override',
        taskID: null,
        lapsesAt: record.recordedAt.getTime() + legacyLapseMs,
        deadlineAt: null,
      },
    };
  }

  if (record.kind === promptsOverrideApprovedCodec.kind) {
    const approved = promptsOverrideApprovedCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: approved.proposalID,
      state: 'approved',
      usedBy: approved.approvalID,
      answeredBy: approved.identityID ?? null,
    };
  }

  if (record.kind === promptsOverrideRejectedCodec.kind) {
    return {
      type: 'close',
      proposalID: promptsOverrideRejectedCodec.decode(record.payload).proposalID,
      state: 'declined',
      usedBy: null,
      answeredBy: null,
    };
  }

  if (record.kind === promptsOverrideLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: promptsOverrideLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
      answeredBy: null,
    };
  }

  return null;
}
