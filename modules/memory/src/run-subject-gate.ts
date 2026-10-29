import type { ContentGateResult, GatedRememberRequest } from './gate-types';
import { getRowSubject } from './get-row-subject';
import { pickSubjectChangeReview } from './pick-subject-change-review';
import { requireImageSource } from './require-image-source';
import { requireItem } from './require-item';
import { runContentGate } from './run-content-gate';
import { runImageGate } from './run-image-gate';
import { runSelfNoteGate } from './run-self-note-gate';
import { SelfNoteError } from './self-note-error';
import type { MemorySubject, MemoryTables, StoreParts } from './types';

export interface SubjectGateResult {
  readonly gate: ContentGateResult;
  readonly subject: MemorySubject;
  readonly newSubject: MemorySubject | null;

  readonly until: number | null;
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
  const isNewSelfNote =
    subjects.newSubject === 'self' || (request.target === undefined && subjects.subject === 'self');

  if (subjects.subject === 'self' || isNewSelfNote) {
    requireSelfNoteWrite(request, isNewSelfNote);
  }

  if ((subjects.newSubject ?? subjects.subject) === 'self') {
    return runSelfNoteGate(parts.context, { text: request.text, thread: request.caller.thread });
  }

  const content = {
    text: request.text,
    quote: request.quote ?? null,
    eventID: request.eventID ?? null,
    isPinned: false,
    thread: request.caller.thread,
    until: request.until ?? null,
  };

  if (request.image !== undefined) {
    return runImageGate(parts.context, content);
  }

  const tool = request.target === undefined ? 'memory.remember' : 'memory.edit';

  return runContentGate(parts.context, content, tool);
}

function requireSelfNoteWrite(request: GatedRememberRequest, isNewSelfNote: boolean): void {
  if (isNewSelfNote && request.caller.origin !== 'conversation') {
    throw new SelfNoteError(
      `only the conversation writes a self-note, and this write came from the ${request.caller.origin}`,
    );
  }

  if (request.caller.origin === 'memory_writer') {
    throw new SelfNoteError('the note-taker never edits a self-note');
  }
}
