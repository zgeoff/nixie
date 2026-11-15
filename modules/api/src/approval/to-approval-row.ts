import type { SharedProposal } from '@heynixie/proposals';

export function toApprovalRow(row: SharedProposal) {
  return {
    proposalID: row.id,
    shortID: row.shortID,
    kind: row.kind,
    riskClass: row.riskClass,
    actionHash: row.actionHash,
    ruleHash: row.ruleHash,
    cause: row.cause,
    state: row.state,
    createdAt: new Date(row.createdAt),
    lapsesAt: new Date(row.lapsesAt),
    deadlineAt: row.deadlineAt === null ? null : new Date(row.deadlineAt),
    deferGeneration: row.deferGeneration,
    deferUntil: row.deferUntil === null ? null : new Date(row.deferUntil),
    thread: row.thread,
    taskID: row.taskID,
    sequence: row.createdSequence,
  };
}
