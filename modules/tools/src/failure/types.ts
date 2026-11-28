export interface RetryConfig {
  readonly maxAttempts: number;
  readonly budgetMs: number;
  readonly detailChars: number;
}
