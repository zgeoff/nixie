// The most bytes of attachments that one mail keeps, which is also the most that a send carries.
export const maxAttachmentBytes = 26_214_400;

// How many attachments a mail keeps: the longest run from the first whose sizes add up to the
// limit or less. A later attachment never skips ahead of one that did not fit.
export function countStoredAttachments(sizes: readonly number[]): number {
  let total = 0;

  for (const [index, size] of sizes.entries()) {
    total += size;

    if (total > maxAttachmentBytes) {
      return index;
    }
  }

  return sizes.length;
}
