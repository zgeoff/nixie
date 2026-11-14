import type { TurnFrame } from './build-query-options';

const defaultCompactWindow = 200_000;

export function getCompactWindow(profile: TurnFrame['profile']): number {
  return profile.contextTokens ?? defaultCompactWindow;
}
