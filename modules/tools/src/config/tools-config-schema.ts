import { z } from 'zod';
import type { ToolRetryOptions } from '../call-record/tool-call-options';

export interface ToolsConfig {
  readonly retry: Required<Omit<ToolRetryOptions, 'random'>>;
}

// The settings of the tool endpoint. A connector call that fails in a way that can clear tries again
// at most `retry_attempts` times inside `retry_budget_ms`, and the provider's message that reaches
// the model keeps its first `error_detail_chars` characters.
export const toolsConfigSchema = z
  .strictObject({
    retry_attempts: z.int().min(1).default(3),
    retry_budget_ms: z.int().min(1).default(15_000),
    error_detail_chars: z.int().min(1).default(1000),
  })
  .transform((config): ToolsConfig => ({
    retry: {
      maxAttempts: config.retry_attempts,
      budgetMs: config.retry_budget_ms,
      detailChars: config.error_detail_chars,
    },
  }));
