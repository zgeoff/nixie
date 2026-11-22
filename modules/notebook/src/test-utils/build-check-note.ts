import type { CheckNote } from '../check/build-check';

export function buildCheckNote(shortID: string, editedAt: number, isPrivate = false): CheckNote {
  return { noteID: `${shortID}-uuid`, shortID, title: `Title ${shortID}`, editedAt, isPrivate };
}
