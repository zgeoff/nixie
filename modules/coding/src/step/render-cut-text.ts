// Keeps the end of a text past the limit, where a reply says what it did, and opens it with a line
// that says nixie cut it.
export function renderCutText(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  return `[nixie cut the start of this text]\n${text.slice(text.length - limit)}`;
}
