// The primary key of trigger_keys: the source and the dedupe key.
export function buildSourceKey(source: string, dedupeKey: string): string {
  return `${source}\n${dedupeKey}`;
}
