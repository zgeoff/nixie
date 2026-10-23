// The restore marker in the data directory holds the state: no marker is none, and the marker is
// replacing. A restore that stops part way leaves replacing, and the next restore starts from it.
export type RestoreState = 'none' | 'replacing';

export const restoreMoves: Readonly<Record<RestoreState, readonly RestoreState[]>> = {
  none: ['replacing'],
  replacing: ['replacing', 'none'],
};
