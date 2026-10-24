// The key goes beside the sample, and its name ends in a suffix the sample's name lacks, so the key
// never overwrites the sample whatever path the sample takes.
export function buildKeyPath(samplePath: string): string {
  return `${samplePath.replace(/\.jsonl$/u, '')}-key.jsonl`;
}
