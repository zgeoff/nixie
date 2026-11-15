interface ConsolidatorUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface ConsolidatorModel {
  readonly model: string;
  readonly profile: string;
  readonly runSession: (session: ConsolidatorSessionInput) => Promise<ConsolidatorUsage>;
}

interface ConsolidatorSessionInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly signal: AbortSignal;

  readonly stepRunID: string;
}
