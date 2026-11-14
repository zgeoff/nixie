export interface MessageCursor {
  readonly readThrough: () => number;
  readonly updateThrough: (sequence: number) => void;
  readonly addRemoved: (sequence: number) => void;
  readonly isRemoved: (sequence: number) => boolean;
}

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
