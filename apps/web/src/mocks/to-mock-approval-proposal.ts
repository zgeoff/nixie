import type { store } from './store';

type StoredRow = ReturnType<typeof store.approvalRows.all>[number];

export function toMockApprovalProposal(row: StoredRow) {
  return {
    actionHash: row.actionHash,
    cause: row.cause,
    createdAt: row.createdAt,
    deadlineAt: row.deadlineAt,
    deferGeneration: row.deferGeneration,
    deferUntil: row.deferUntil,
    kind: row.kind,
    lapsesAt: row.lapsesAt,
    proposalID: row.proposalID,
    riskClass: row.riskClass,
    ruleHash: row.ruleHash,
    sequence: row.sequence,
    shortID: row.shortID,
    state: row.state,
    taskID: row.taskID,
    thread: row.thread,
  };
}

export function toMockApprovalBody(row: StoredRow) {
  return {
    approveLabel: row.approveLabel,
    fields: { ...row.fields },
    ...(row.memory === undefined ? {} : { memory: structuredClone(row.memory) }),
    ...(row.proposedRule === undefined ? {} : { rule: structuredClone(row.proposedRule) }),
    ruleSentence: row.ruleSentence,
    sentence: row.sentence,
  };
}
