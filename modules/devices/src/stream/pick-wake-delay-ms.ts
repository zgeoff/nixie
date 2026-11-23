import type { LayoutView, ScreenState } from '../types';

// How long until a screen changes with no record to say so: the earliest end among the show and
// the regions of the layout, which keep counting while a show covers it. Null for a screen that
// only a record changes.
export function pickWakeDelayMs(
  state: ScreenState,
  layout: LayoutView | null,
  nowMs: number,
): number | null {
  const ends = [
    state.kind === 'show' && state.until !== null ? Date.parse(state.until) : null,
    ...(layout?.regions.map((region) => region.shown?.untilMs ?? null) ?? []),
  ].filter((end) => end !== null);

  return ends.length === 0 ? null : Math.max(Math.min(...ends) - nowMs, 1);
}
