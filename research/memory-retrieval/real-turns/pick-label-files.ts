// A rater may answer in parts, so a folder of labels holds one .jsonl file a part, read in name order.
export function pickLabelFiles(names: string[]): string[] {
  return names.filter((name) => name.endsWith('.jsonl')).toSorted();
}
