// Strips the characters that open and close a link mark from a page's own text, so a page cannot
// forge a mark.
export function stripLinkMarks(text: string): string {
  return text.replaceAll(/[\u{E000}\u{E001}]/gu, '');
}
