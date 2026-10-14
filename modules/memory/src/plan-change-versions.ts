import type { ChangeAnswer, ConsolidationChangeRow } from './consolidation-types';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import { parseChangeInputs } from './parse-change-inputs';
import { planRememberedVersion } from './plan-remembered-version';
import { planRetiredVersion } from './plan-retired-version';
import { readChangeText } from './read-change-text';
import type { Provenance, StoreParts, VersionRef } from './types';
import type { VersionPlan } from './write-version-in-transaction';

// Plans the versions a change writes, the last carrying your approval: a merge retires its other
// inputs first, so the pinned core's room counts the core the merge leaves, then writes its text on
// the first; a rewrite writes its text, and a retirement retires its one input.
export async function planChangeVersions(
  parts: StoreParts,
  row: ConsolidationChangeRow,
  answer: ChangeAnswer,
): Promise<readonly VersionPlan[]> {
  const opened = await readChangeText(parts.context.log, row);
  const [first, ...rest] = parseChangeInputs(row.inputs);

  if (first === undefined) {
    throw new Error(`consolidation change ${row.change_id} has no input`);
  }
  const provenance = buildChangeProvenance(row);
  const lead =
    opened.text === null
      ? planRetiredVersion({ target: first, provenance })
      : planActiveEdit(first, opened.text, provenance);
  const retired = rest.map((target) => planRetiredVersion({ target, provenance }));

  return [...retired, { ...lead, approval: buildApproval(parts, row, answer) }];
}

// A change's versions take the consolidator as a task for their origin, and the least trusted
// source among the change's inputs, so approving a merge never relabels outside content as yours.
function buildChangeProvenance(row: ConsolidationChangeRow): Provenance {
  return {
    origin: 'task',
    source: row.source,
    taskID: memoryConsolidatorTaskID,
    proposalID: row.change_id,
    checks: null,
    thread: memoryConsolidatorTaskID,
    model: row.model,
  };
}

// a merge or a rewrite edits an active item only, because consolidation reads active items
function planActiveEdit(target: VersionRef, text: string, provenance: Provenance): VersionPlan {
  const plan = planRememberedVersion({ text, target, provenance });

  return { ...plan, requirement: { target, operation: 'consolidate', states: ['active'] } };
}

// your approval of the one change, which commits with its versions and consumes the change
function buildApproval(
  parts: StoreParts,
  row: ConsolidationChangeRow,
  answer: ChangeAnswer,
): NonNullable<VersionPlan['approval']> {
  const approvalID = crypto.randomUUID();
  const envelope = { proposalID: row.change_id, approvalID, actionHash: row.action_hash };

  return {
    envelope,
    record: {
      kind: 'memory.consolidation_approved',
      definitions: parts.context.definitions(),
      thread: memoryConsolidatorTaskID,
      approval: envelope,
      payload: {
        changeID: row.change_id,
        approvalID,
        actionHash: row.action_hash,
        identityID: answer.identityID,
      },
    },
  };
}
