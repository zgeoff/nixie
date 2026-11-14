// a link target runs longer than the text that marks it, so the targets get a larger budget than
// the text, and a page full of links still fills its text limit
const targetBytesPerTextByte = 4;

// Gets the most bytes the link targets of one fetch reply hold, for a reply whose text holds at
// most textBytes, so the fetcher and nixie agree on the reply's size limit.
export function getLinkTargetLimit(textBytes: number): number {
  return textBytes * targetBytesPerTextByte;
}
