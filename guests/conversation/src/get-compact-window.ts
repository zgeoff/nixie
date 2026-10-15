import type { TurnFrame } from './build-query-options';

// the window of a profile that sets no context cap, the smallest the CLI assumes for any model
const defaultCompactWindow = 200_000;

// The window, in tokens, that nixie's compactor measures the session against: the profile's context
// cap instead of the model's own window. The guest also passes it to the CLI as its auto-compact
// window, which the CLI ignores while auto-compaction is off.
export function getCompactWindow(profile: TurnFrame['profile']): number {
  return profile.contextTokens ?? defaultCompactWindow;
}
