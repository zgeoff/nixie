// No marker is none, an empty marker or one that does not parse is replacing, and one that parses as
// a PendingRestore is holding. A restore that stops part way leaves replacing.
export type RestoreState = 'none' | 'replacing' | 'holding';

export const restoreMoves: Readonly<Record<RestoreState, readonly RestoreState[]>> = {
  none: ['replacing'],
  replacing: ['replacing', 'holding', 'none'],
  holding: ['replacing', 'none'],
};
