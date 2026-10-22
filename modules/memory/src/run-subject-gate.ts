import type { ContentGateResult, GatedRememberRequest } from './gate-types';
import { getRowSubject } from './get-row-subject';
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
  const image = request.image;

  if (image !== undefined) {
    await requireImageSource(parts.context.log, { thread: request.caller.thread, image });
  }

  const gate = await runGateOfSubject(parts, request, subject);

  return {
    gate: image === undefined ? gate : { ...gate, checks: { ...gate.checks, image: { ...image } } },
    subject,
  };
}

function runGateOfSubject(
  parts: StoreParts,
  request: GatedRememberRequest,
  subject: MemorySubject,
): Promise<ContentGateResult> {
  if (subject === 'self') {
    requireSelfNoteWrite(request);

    return runSelfNoteGate(parts.context, { text: request.text, thread: request.caller.thread });
  }

  const content = {
    text: request.text,
    quote: request.quote ?? null,
    eventID: request.eventID ?? null,
    isPinned: false,
    thread: request.caller.thread,
  };

  if (request.image !== undefined) {
    return runImageGate(parts.context, content);
  }

  const tool = request.target === undefined ? 'memory.remember' : 'memory.edit';

  return runContentGate(parts.context, content, tool);
}

function requireSelfNoteWrite(request: GatedRememberRequest): void {
  if (request.target === undefined && request.caller.origin !== 'conversation') {
    throw new SelfNoteError(
      `only the conversation writes a self-note, and this write came from the ${request.caller.origin}`,
    );
  }

  if (request.caller.origin === 'memory_writer') {
    throw new SelfNoteError('the note-taker never edits a self-note');
  }
}
