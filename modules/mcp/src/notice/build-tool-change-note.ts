import type { Definitions, RecordInput } from '@heynixie/log';
import { toolChangedCodec } from '@heynixie/tasks';
import type { PinMove } from '../types';

export interface ToolChangeNoteTarget {
  readonly definitions: Definitions;

  // the thread of the inbox that hears the note
  readonly thread: string;
}

// The inbox record of a pin move that applied with no allow, or null for a move that needs none: you
// allowed the tool yourself, or a forget moved it.
export function buildToolChangeNote(
  move: PinMove,
  target: ToolChangeNoteTarget,
): RecordInput | null {
  if (move.cause !== 'trusted_change') {
    return null;
  }

  return {
    kind: toolChangedCodec.kind,
    definitions: target.definitions,
    thread: target.thread,
    payload: toolChangedCodec.encode({
      tool: move.tool,
      fromHash: move.fromHash,
      toHash: move.toHash,
    }),
  };
}
