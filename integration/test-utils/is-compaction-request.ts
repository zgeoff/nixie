// Whether a model request holds the prompt that the Codex CLI sends to compact its context.
interface CompactionRequestBody {
  readonly input?: unknown;
}

export function isCompactionRequest(body: CompactionRequestBody): boolean {
  return JSON.stringify(body.input).includes('CONTEXT CHECKPOINT COMPACTION');
}
