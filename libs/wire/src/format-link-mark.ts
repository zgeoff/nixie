// Formats the mark the fetcher writes in a page's text where a link ends: the link's index in the
// reply's links between two private-use characters. The fetcher strips both characters from the
// page's own text, so every mark that reaches nixie is one it wrote.
export function formatLinkMark(index: number): string {
  return `\u{E000}${index}\u{E001}`;
}
