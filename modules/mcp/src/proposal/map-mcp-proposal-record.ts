import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalChange } from '@heynixie/proposals';
import { mcpAnsweredCodec } from '../record/mcp-answered-codec';
import { mcpLapsedCodec } from '../record/mcp-lapsed-codec';
import { mcpProposedCodec } from '../record/mcp-proposed-codec';

// the lapse that every record written before the config set one carried
const legacyLapseMs = 14 * 24 * 60 * 60 * 1000;

// What each record of the mcp family means for the shared proposals row. A server proposal asks the
// owner to approve with the passkey; a tool's allow is routine.
export function mapMcpProposalRecord(record: EnvelopeRecord): ProposalChange | null {
  if (record.kind === mcpProposedCodec.kind) {
    const proposed = mcpProposedCodec.decode(record.payload);
    const isServer = proposed.operation.change === 'server';

    return {
      type: 'create',
      proposal: {
        id: proposed.proposalID,
        shortID: proposed.shortID,
        family: 'mcp',
        kind: 'internal_change',
        riskClass: isServer ? 'always_ask' : 'routine',
        actionHash: proposed.actionHash,
        ruleHash: null,
        cause: isServer ? 'mcp_config' : 'mcp_allow',
        taskID: null,
        lapsesAt: record.recordedAt.getTime() + legacyLapseMs,
        deadlineAt: null,
      },
    };
  }

  if (record.kind === mcpAnsweredCodec.kind) {
    const answered = mcpAnsweredCodec.decode(record.payload);

    return {
      type: 'close',
      proposalID: answered.proposalID,
      state: answered.state === 'approved' ? 'approved' : 'declined',
      usedBy: null,
      answeredBy: answered.identityID,
    };
  }

  if (record.kind === mcpLapsedCodec.kind) {
    return {
      type: 'close',
      proposalID: mcpLapsedCodec.decode(record.payload).proposalID,
      state: 'lapsed',
      usedBy: null,
      answeredBy: null,
    };
  }

  return null;
}
