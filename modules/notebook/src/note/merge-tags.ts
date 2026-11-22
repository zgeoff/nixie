// Tags that match ignoring case merge into one, and the first spelling stays.
export function mergeTags(tags: readonly string[]): readonly string[] {
  const seen = new Set<string>();

  const merged: string[] = [];

  for (const tag of tags) {
    const key = tag.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(tag);
    }
  }

  return merged;
}

export function hasEveryTag(noteTags: readonly string[], wanted: readonly string[]): boolean {
  const held = new Set(noteTags.map((tag) => tag.toLowerCase()));

  return wanted.every((tag) => held.has(tag.toLowerCase()));
}
