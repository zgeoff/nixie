import { expect, test } from 'bun:test';
import type { ErasableRecordKind } from '@heynixie/log';
import { erasableDescriptors } from '../erasure/erasable-descriptors';

function setupTest() {
  // Each kind that carries erasable fields, with the names of those fields. A new erasable kind
  // fails the build until it is listed here, and then the tests make its author classify it.
  const erasableFieldNames = {
    'action.outcome': ['result', 'message'],
    'action.queued': ['arguments'],
    'action.reconcile_checked': ['result', 'message'],
    'action.retry_scheduled': ['result', 'message'],
    'computer.handover_asked': ['reason'],
    'computer.takeover_ended': ['origins', 'now'],
    'definition.changed': ['version'],
    'device.idle_set': ['scene'],
    'device.page_event': ['data'],
    'device.region_shown': ['content'],
    'device.shown': ['content'],
    'image.named': ['name'],
    'memory.fold_ordered': ['topic'],
    'memory.image_offered': ['text'],
    'memory.proposal_rejected': ['reason'],
    'mcp.tool_listed': ['form'],
    'model.compaction_failed': ['message'],
    'model.reply': ['text', 'summary'],
    'model.session_summarized': ['text'],
    moment_edited: ['title', 'note', 'reflection'],
    moment_kept: ['title'],
    'notebook.linked': ['reason'],
    'notebook.note_edited': ['title', 'body', 'tags'],
    'notebook.note_written': ['title', 'body', 'tags'],
    owner_message: ['text', 'spans', 'sessionLabel'],
    'passkey.registered': ['label'],
    'policy.action_answered': ['reason'],
    'policy.action_proposed': ['rule', 'ruleID', 'ruleSentence', 'input', 'destinations'],
    'policy.contact_marked_known': ['name', 'destination'],
    'prompts.override_rejected': ['reason'],
    'proposals.deferred': ['note'],
    'rules.mandate_proposed': ['title', 'rules'],
    'rules.rule_proposed': ['rule'],
    'session.enrolled': ['label'],
    'session.labelled': ['label'],
    session_kept: ['label'],
    'skills.write_rejected': ['reason'],
    'task.created': ['brief', 'name'],
    'task.run_ended': ['body'],
    'task.run_report_requested': ['summary', 'fields'],
    'task.step_errored': ['message'],
    task_message: ['body'],
    tool_called: ['input', 'destinations'],
    'mail.received': ['from', 'to', 'cc', 'subject', 'text', 'attachments'],
    'mail.sent': ['to', 'subject', 'text'],
    'trigger.mail_arrived': ['from', 'subject'],
    'trigger.mail_woke': ['mails'],
    'trigger.task_input': ['event'],
    'worker.run_ended': ['detail'],
    'worker.turn_ended': ['text'],

    // The fields of a result are the content its tool declares, so they differ by tool.
    tool_result: [],
  } as const satisfies Record<ErasableRecordKind, readonly string[]>;

  // Each list of each descriptor is one group, so a kind in two lists or in none fails.
  const groups: readonly (readonly string[])[] = erasableDescriptors.flatMap((descriptor) => [
    descriptor.recordKinds.erasable,
    descriptor.recordKinds.forgettable,
    descriptor.recordKinds.unforgettable,
  ]);

  return { erasableKinds: Object.keys(erasableFieldNames), groups };
}

test('it holds each erasable kind in exactly one descriptor list', () => {
  const ctx = setupTest();

  const misplaced = ctx.erasableKinds.filter(
    (kind) => ctx.groups.filter((group) => group.includes(kind)).length !== 1,
  );

  expect(misplaced).toStrictEqual([]);
});

test('it keeps a kind that carries no erasable fields out of every descriptor list', () => {
  const ctx = setupTest();
  const stray = ctx.groups.flat().filter((kind) => !ctx.erasableKinds.includes(kind));

  expect(stray).toStrictEqual([]);
});

test('it lists no kind twice across every descriptor list', () => {
  const ctx = setupTest();
  const kinds = ctx.groups.flat();

  expect(new Set(kinds).size).toBe(kinds.length);
});
