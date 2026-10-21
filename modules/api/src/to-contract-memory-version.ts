import type { ViewEvidence, ViewVersion } from '@heynixie/memory';

export function toContractMemoryVersion(version: ViewVersion) {
  return {
    version: version.version,
    change: version.change,
    state: version.state,
    origin: version.origin,
    source: version.source,
    recordedAt: new Date(version.recordedAt),
    taskID: version.taskID,
    proposalID: version.proposalID,
    checks: version.checks,
    writerModel: version.writerModel,
    checkerModel: version.checkerModel,
    evidenceQuote: version.evidenceQuote,
    evidence: version.evidence === null ? null : toContractEvidence(version.evidence),
    status: version.status,
    ...(version.status === 'readable' ? { text: version.text } : {}),
  };
}

function toContractEvidence(evidence: ViewEvidence) {
  return {
    sequence: evidence.recordSequence,
    start: evidence.start,
    end: evidence.end,
    message:
      evidence.message === null
        ? null
        : {
            status: evidence.message.status,
            ...(evidence.message.status === 'readable' ? { text: evidence.message.text } : {}),
          },
  };
}
