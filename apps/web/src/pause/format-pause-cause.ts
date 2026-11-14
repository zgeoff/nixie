import { match } from 'ts-pattern';
import type { PauseCause } from '../types';

export function formatPauseCause(cause: PauseCause): string {
  return match(cause)
    .with('restore', () => 'a restore')
    .with('owner', () => 'you')
    .with('spending', () => 'the spending limit')
    .exhaustive();
}
