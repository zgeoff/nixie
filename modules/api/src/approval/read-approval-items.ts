import type { UnknownOutcome } from '@heynixie/actions';
import { readUnknownOutcomes } from '@heynixie/actions';
import { readMessageTimeZone } from '@heynixie/connectors';
import { buildActionProposalSentence } from '@heynixie/policy';
import type { ProposalCoreDeps } from '@heynixie/proposals';
import { pickPasskeyChoices, pickProposalChoices, readOpenProposals } from '@heynixie/proposals';
import type { APIContext, ReadViewMemory } from '../types';
import { defaultApprovalSettings } from '../utils/default-api-settings';
import { collectOrderedRows, pickApprovalGroup } from './collect-ordered-rows';
import { readApprovalBodies } from './read-approval-bodies';
import { readApprovalChains } from './read-approval-chains';
import { toApprovalRow } from './to-approval-row';

// The open rows that have a handler and a body, in the digest's order.
export async function readApprovalItems(
  context: APIContext,
  deps: ProposalCoreDeps,
  readMemory: ReadViewMemory,
) {
  const db = context.log.writer.db;
  const approvals = context.settings.approvals ?? defaultApprovalSettings;

  const rows = await readOpenProposals(db, context.clock.now());
  const bodies = await readApprovalBodies(deps, readMemory, rows);

  const directory = new Map(context.settings.taskDirectory.map((task) => [task.taskID, task.name]));

  const items = rows.flatMap((row) => {
    const body = bodies.get(row.id);

    if (body === undefined || body === null) {
      return [];
    }

    const taskID = row.taskID ?? row.thread;

    return [
      {
        proposal: row,
        group: pickApprovalGroup(row),
        taskName: taskID === null ? null : (directory.get(taskID) ?? taskID),
        taskID,
        body,
      },
    ];
  });

  const chains = await readApprovalChains(
    context,
    items.flatMap((item) =>
      item.taskID === null
        ? []
        : [
            {
              proposalID: item.proposal.id,
              taskID: item.taskID,
              createdSequence: item.proposal.createdSequence,
            },
          ],
    ),
  );

  const messageZone = await readMessageTimeZone(context.log);
  const unknown = await readUnknownOutcomes(context.log);

  return {
    defer: {
      defaultMinutes: approvals.defaultMinutes,
      eveningAt: approvals.eveningAt,
      morningAt: approvals.morningAt,
      zone: messageZone ?? approvals.defaultZone,
    },
    items: collectOrderedRows(items).map((item) => ({
      group: item.group,
      proposal: toApprovalRow(item.proposal),
      body: item.body,
      task: item.taskID === null ? null : { id: item.taskID, name: item.taskName ?? item.taskID },
      chain: item.taskID === null ? [] : (chains.get(item.proposal.id) ?? []),
      choices: [...pickProposalChoices(item.proposal)],
      passkeyChoices: [...pickPasskeyChoices(item.proposal)],
    })),
    unknownOutcomes: unknown.map((outcome) => buildUnknownItem(outcome, directory)),
  };
}

// The unknown outcomes list first, because an action that may have happened is the one thing the
// owner cannot leave to the digest's order.
function buildUnknownItem(outcome: UnknownOutcome, directory: ReadonlyMap<string, string>) {
  return {
    group: 'unknown_outcome' as const,
    action: {
      actionID: outcome.actionID,
      tool: outcome.tool,
      sentence: buildActionProposalSentence(outcome.tool, outcome.effects, outcome.destinations),
      fields: { ...outcome.fields },
      riskClass: outcome.riskClass,
      reason: outcome.ownerReason,
      becameUnknownAt: new Date(outcome.becameUnknownAt),
      attempts: outcome.attempts.map((attempt) => ({
        attempt: attempt.attempt,
        at: new Date(attempt.at),
      })),
      checks: outcome.checks.map((check) => ({ answer: check.answer, at: new Date(check.at) })),
    },
    task: { id: outcome.taskID, name: directory.get(outcome.taskID) ?? outcome.taskID },
    choices: ['happened' as const, 'retry' as const, 'drop' as const],
    passkeyChoices: outcome.riskClass === 'routine' ? [] : ['retry' as const],
  };
}
