import type { ContentGateResult, GatedRememberRequest } from './gate-types';
import { requireItem } from './require-item';
import { runContentGate } from './run-content-gate';
import { runSelfNoteGate } from './run-self-note-gate';
import { SelfNoteError } from './self-note-error';
import type { MemoryKind, MemoryTables, StoreParts } from './types';

// The gate a remember or an edit ran, with the kind of its item.
export interface KindGateResult {
  readonly gate: ContentGateResult;
  readonly itemKind: MemoryKind;
}

// Runs the gate of the write's kind: a self-note's own gate, which always sends it to review, or
// the content gate under the allow rule of the write's tool. An edit takes its item's kind,
// whatever the write asks for, and is refused for a missing item or a moved-on version.
export async function runKindGate(
  parts: StoreParts,
  request: GatedRememberRequest,
): Promise<KindGateResult> {
  const item =
    request.target === undefined
      ? null
      : await requireItem(parts.context.log.writer.db.$extendTables<MemoryTables>(), {
          target: request.target,
          operation: 'edit',
          states: ['active', 'retired'],
        });

  const itemKind = item?.kind ?? request.itemKind ?? 'fact';

  if (itemKind === 'self') {
    requireSelfNoteWrite(request);

    const gate = await runSelfNoteGate(parts.context, {
      text: request.text,
      thread: request.caller.thread,
    });

    return { gate, itemKind };
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

  return { gate, itemKind };
}

// only the conversation creates a self-note, and a self-note is never pinned, so neither write
// reaches your review
function requireSelfNoteWrite(request: GatedRememberRequest): void {
  if (request.target === undefined && request.caller.origin !== 'conversation') {
    throw new SelfNoteError(
      `only the conversation writes a self-note, and this write came from the ${request.caller.origin}`,
    );
  }

  if (request.isPinned === true) {
    throw new SelfNoteError('a self-note is never pinned');
  }
}
