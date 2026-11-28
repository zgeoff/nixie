import type { Definitions, RecordInput } from '@heynixie/log';
import { toolChangedCodec } from '@heynixie/tasks';
import type { PinMove } from '../types';

export interface ToolChangeNoteTarget {
  readonly definitions: Definitions;

  // the thread of the inbox that hears the note
  readonly thread: string;
}

// The inbox record of a pin move that applied with no allow, or null for a move that needs none: a
// first listing, your accept of a change, or a forget.
export function buildToolChangeNote(
  move: PinMove,
  target: ToolChangeNoteTarget,
): RecordInput | null {
  if (move.cause !== 'changed') {
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
