import { readMessageTimeZone } from '@heynixie/connectors';
import type { ProposalCoreDeps } from '@heynixie/proposals';
import { pickProposalChoices, readOpenProposals } from '@heynixie/proposals';
import type { APIContext, ReadViewMemory } from '../types';
import { defaultApprovalSettings } from '../utils/default-api-settings';
import { collectOrderedRows, pickApprovalGroup } from './collect-ordered-rows';
import { readApprovalBodies } from './read-approval-bodies';
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

  const messageZone = await readMessageTimeZone(context.log);

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
      choices: [...pickProposalChoices(item.proposal)],
    })),
  };
}
