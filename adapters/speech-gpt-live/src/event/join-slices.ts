import type { TranscriptSlice } from '../types';

export function joinSlices(slices: readonly TranscriptSlice[]): string {
  return slices
    .map((slice) => slice.text)
    .join('')
    .trim();
}
