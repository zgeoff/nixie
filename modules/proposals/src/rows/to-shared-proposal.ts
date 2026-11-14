import type { SharedProposal } from '../answer/proposal-kind-handler';
import type { ProposalTables } from './proposal-tables';

type ProposalRow = ProposalTables['proposals'];

export function toSharedProposal(row: ProposalRow): SharedProposal {
  return {
    id: row.proposal_id,
    shortID: row.short_id,
    family: row.family,
    kind: row.kind,
    riskClass: row.risk_class,
    actionHash: row.action_hash,
    ruleHash: row.rule_hash,
    cause: row.cause,
    taskID: row.task_id,
    thread: row.thread,
    createdSequence: row.created_sequence,
    createdAt: row.created_at,
    lapsesAt: row.lapses_at,
    deadlineAt: row.deadline_at,
    state: row.state,
    usedBy: row.used_by,
    deferGeneration: row.defer_generation,
    deferUntil: row.defer_until,
    returnAt: row.return_at,
  };
}
