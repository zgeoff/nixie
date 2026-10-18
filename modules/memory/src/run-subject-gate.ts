import type { ContentGateResult, GatedRememberRequest } from './gate-types';
import { requireItem } from './require-item';
import { runContentGate } from './run-content-gate';
import { runSelfNoteGate } from './run-self-note-gate';
import { SelfNoteError } from './self-note-error';
import type { MemorySubject, MemoryTables, StoreParts } from './types';

// The gate a remember or an edit ran, with the subject of its item.
export interface SubjectGateResult {
  readonly gate: ContentGateResult;
  readonly subject: MemorySubject;
}

// Runs a self-note's own gate, which always sends it to review, or for any other subject the content
// gate under the allow rule of the write's tool. An edit takes its item's subject, whatever the
// write asks for, and is refused for a missing item or a moved-on version.
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

  const subject = item?.subject ?? request.subject ?? 'owner';

  if (subject === 'self') {
    requireSelfNoteWrite(request);

    const gate = await runSelfNoteGate(parts.context, {
      text: request.text,
      thread: request.caller.thread,
    });

    return { gate, subject };
  }

  const tool = request.target === undefined ? 'memory.remember' : 'memory.edit';

  const gate = await runContentGate(
    parts.context,
    {
      text: request.text,
      quote: request.quote ?? null,
      eventID: request.eventID ?? null,
      isPinned: request.isPinned === true,
      thread: request.caller.thread,
    },
    tool,
  );

  return { gate, subject };
}

// only the conversation creates a self-note, and the note-taker never changes one, because a
// self-note is nixie's own voice about itself, so neither write reaches your review
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
