interface ContextUsage {
  readonly input_tokens: number;
  readonly cache_read_input_tokens: number | null;
  readonly cache_creation_input_tokens: number | null;
}

export function countContextTokens(usage: ContextUsage): number {
  return (
    usage.input_tokens +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  );
}
