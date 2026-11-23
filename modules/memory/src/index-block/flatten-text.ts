// A label, a gist or a topic name is model-written text, so a line break in it stays one line.
export function flattenText(text: string): string {
  return text.replaceAll(/\s+/gu, ' ').trim();
}
