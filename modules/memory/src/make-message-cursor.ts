// How far the message indexes have read the log, and the messages forgotten since start, which a
// catch-up that read one before its forget drops again. The state stays in the closure, so the
// store's parts hold functions only.
export interface MessageCursor {
  readonly readThrough: () => number;
  readonly updateThrough: (sequence: number) => void;
  readonly addRemoved: (sequence: number) => void;
  readonly isRemoved: (sequence: number) => boolean;
}

// Makes a cursor at the start of the log with no message removed.
export function makeMessageCursor(): MessageCursor {
  const state = { through: 0 };

  const removed = new Set<number>();

  return {
    readThrough: () => state.through,
    updateThrough: (sequence) => {
      state.through = sequence;
    },
    addRemoved: (sequence) => {
      removed.add(sequence);
    },
    isRemoved: (sequence) => removed.has(sequence),
  };
}
