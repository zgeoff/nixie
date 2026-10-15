// the models whose entry in the CLI's bundled catalog marks a native 1,000,000-token window, read
// from Claude Code 2.1.290, the CLI the pinned Agent SDK ships
const nativeMillionModels = new Set([
  'claude-sonnet-5',
  'claude-sonnet-5-5',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
  'claude-fable-5',
  'claude-fable-5-1',
  'claude-mythos-5',
  'claude-mythos-5-1',
]);

const millionWindow = 1_000_000;

// the window the CLI assumes for every other model, whatever the model API allows
const defaultWindow = 200_000;

// The context window, in tokens, the Claude CLI assumes for a model, which with auto-compaction off
// is the only limit it refuses a call against. A model the list misses gets the smaller window, so
// a check against it errs toward a refusal.
export function getCLIContextWindow(model: string): number {
  if (/\[1m\]/iu.test(model) || nativeMillionModels.has(model.toLowerCase())) {
    return millionWindow;
  }

  return defaultWindow;
}
