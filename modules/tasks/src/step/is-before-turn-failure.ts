import { beforeTurnFailures } from './before-turn-failures';

export function isBeforeTurnFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && beforeTurnFailures.has(error);
}
