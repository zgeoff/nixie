import type { TurnFrame } from './build-query-options';

// the auto-compact window of a profile that sets no context cap
const defaultCompactWindow = 200_000;

// The window, in tokens, that the CLI compacts within: the profile's context cap instead of the
// model's own window.
export function getCompactWindow(profile: TurnFrame['profile']): number {
  return profile.contextTokens ?? defaultCompactWindow;
}
