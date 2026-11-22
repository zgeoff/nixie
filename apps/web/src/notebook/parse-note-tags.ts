export function parseNoteTags(tags: string | undefined): string[] {
  return (tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}
