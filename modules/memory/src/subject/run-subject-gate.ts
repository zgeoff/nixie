import { buildAskReview } from '../gate/build-ask-review';
import type { ContentGateResult, GatedRememberRequest } from '../gate/gate-context';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { runContentGate } from '../gate/run-content-gate';
import { runRuleGate } from '../gate/run-rule-gate';
import { runSelfNoteGate } from '../gate/run-self-note-gate';
import { requireImageSource } from '../image/require-image-source';
import { runImageGate } from '../image/run-image-gate';
import { collectLabelTexts } from '../label/collect-label-texts';
import type { MemorySubject, MemoryTables, StoreParts } from '../types';
import { getRowSubject } from '../utils/get-row-subject';
import { requireItem } from '../utils/item/require-item';
import { pickSubjectChangeReview } from './pick-subject-change-review';
import { requireSelfNoteCaller } from './require-self-note-caller';

export interface SubjectGateResult {
  readonly gate: ContentGateResult;
  readonly subject: MemorySubject;
  readonly newSubject: MemorySubject | null;

  readonly until: number | null;

  // the text version of the item the write edits, null for a write that creates one
  readonly textVersion: number | null;
}

export async function runSubjectGate(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<SubjectGateResult> {
  const item =
    request.target === undefined
      ? null
      : await requireItem(parts.context.log.writer.db.$extendTables<MemoryTables>(), {
          target: request.target,
          operation: 'edit',
          states: ['active', 'retired'],
        });

  const subject = item === null ? (request.subject ?? 'owner') : getRowSubject(item);

  const newSubject =
    item === null || request.subject === undefined || request.subject === subject
      ? null
      : request.subject;

  const image = request.image;

  if (image !== undefined) {
    await requireImageSource(parts.context.log, { thread: request.caller.thread, image });
  }

  const checked = await runGateOfSubject(parts, request, { subject, newSubject });

  const gate = pickSubjectChangeReview(newSubject, checked);

  return {
    gate: image === undefined ? gate : { ...gate, checks: { ...gate.checks, image: { ...image } } },
    subject,
    newSubject,
    until: request.until === undefined ? (item?.until ?? null) : request.until,
    textVersion: item?.version ?? null,
  };
}

interface WriteSubjects {
  readonly subject: MemorySubject;
  readonly newSubject: MemorySubject | null;
}

function runGateOfSubject(
  parts: StoreParts,
  request: GatedRememberRequest,
  subjects: WriteSubjects,
): Promise<ContentGateResult> {
  // any write to a self-note, or into self, writes in nixie's voice
  if (subjects.subject === 'self' || subjects.newSubject === 'self') {
    requireSelfNoteCaller(request.caller);
  }

  const verdict = request.verdict;

  if (verdict?.kind === 'rule-ask') {
    return Promise.resolve(buildAskReview(verdict.rule));
  }

  const content = {
    text: request.text,
    labelTexts: request.labels === undefined ? [] : collectLabelTexts(request.labels),
    quote: request.quote ?? null,
    eventID: request.eventID ?? null,
    thread: request.caller.thread,
    logThread: request.caller.logThread,
    until: request.until ?? null,
  };

  if ((subjects.newSubject ?? subjects.subject) === 'self') {
    const covering = pickCoveringRule(verdict, 'self_note');

    // a self-note from a photo needs a rule for the photo too
    const isPhotoCovered =
      request.image === undefined || pickCoveringRule(verdict, 'photo') !== null;

    return covering === null || !isPhotoCovered
      ? runSelfNoteGate(parts.context, {
          text: request.text,
          labelTexts: content.labelTexts,
          thread: request.caller.thread,
        })
      : runRuleGate(parts.context, content, { id: covering.id, revision: covering.revision });
  }

  if (request.image !== undefined) {
    return runImageGate(parts.context, content, pickCoveringRule(verdict, 'photo'));
  }

  return runContentGate(parts.context, content, pickCoveringRule(verdict, 'none'));
}
