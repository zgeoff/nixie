import type { RuleNeed } from '@heynixie/policy';
import type { MemoryWriteVerdict } from '@heynixie/tools';
import { buildAskReview } from '../gate/build-ask-review';
import { buildRuleGate } from '../gate/build-rule-gate';
import type { ContentGateResult, GatedRememberRequest } from '../gate/gate-context';
import type { CoveringRule } from '../gate/pick-covering-rule';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { runContentGate } from '../gate/run-content-gate';
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

  const covering = pickWriteCoverage(request.verdict, {
    subject: newSubject ?? subject,
    hasImage: image !== undefined,
  });

  const checked = await runGateOfSubject(parts, request, { subject, newSubject, covering });

  // a rule that covers the write covers its subject change too
  const gate = covering === null ? pickSubjectChangeReview(newSubject, checked) : checked;

  return {
    gate: image === undefined ? gate : { ...gate, checks: { ...gate.checks, image: { ...image } } },
    subject,
    newSubject,
    until: request.until === undefined ? (item?.until ?? null) : request.until,
    textVersion: item?.version ?? null,
  };
}

interface WriteTarget {
  readonly subject: MemorySubject;
  readonly hasImage: boolean;
}

// The rule that covers the write, which holds the checks that the subject it ends up under needs: a
// self-note needs a subject check, a photo needs an image check, and a self-note from a photo needs
// both.
function pickWriteCoverage(
  verdict: MemoryWriteVerdict | undefined,
  target: WriteTarget,
): CoveringRule | null {
  if (target.subject === 'self') {
    const covering = pickCoveringRule(verdict, 'self_note');
    const isPhotoCovered = !target.hasImage || pickCoveringRule(verdict, 'photo') !== null;

    return isPhotoCovered ? covering : null;
  }

  const need: RuleNeed = target.hasImage ? 'photo' : 'none';

  return pickCoveringRule(verdict, need);
}

interface WriteSubjects {
  readonly subject: MemorySubject;
  readonly newSubject: MemorySubject | null;
  readonly covering: CoveringRule | null;
}

function runGateOfSubject(
  parts: StoreParts,
  request: GatedRememberRequest,
  subjects: WriteSubjects,
): Promise<ContentGateResult> {
  // a write to a self-note, or into self, writes in nixie's voice; only a rule that covers the
  // write lets a task do it
  if (
    subjects.covering === null &&
    (subjects.subject === 'self' || subjects.newSubject === 'self')
  ) {
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

  if (subjects.covering !== null) {
    return Promise.resolve(buildRuleGate(content, subjects.covering));
  }

  if ((subjects.newSubject ?? subjects.subject) === 'self') {
    return runSelfNoteGate(parts.context, {
      text: request.text,
      labelTexts: content.labelTexts,
      thread: request.caller.thread,
    });
  }

  if (request.image !== undefined) {
    return runImageGate(parts.context, content);
  }

  return runContentGate(parts.context, content);
}
