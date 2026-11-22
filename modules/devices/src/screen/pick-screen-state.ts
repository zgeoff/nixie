import type { ScreenContent } from '@heynixie/contract';
import type { ScreenState } from '../types';

export interface ShownContent {
  readonly content: ScreenContent;

  // the time a show ends, or null for one that lasts until the next show
  readonly untilMs: number | null;
}

interface ScreenInputs {
  readonly shown: ShownContent | null;
  readonly scene: readonly ScreenContent[];
  readonly nowMs: number;
}

// What a screen shows: the latest show until its time passes, then the idle scene, never an older
// show.
export function pickScreenState(inputs: ScreenInputs): ScreenState {
  if (
    inputs.shown !== null &&
    (inputs.shown.untilMs === null || inputs.shown.untilMs > inputs.nowMs)
  ) {
    return {
      kind: 'show',
      content: inputs.shown.content,
      until: inputs.shown.untilMs === null ? null : new Date(inputs.shown.untilMs).toISOString(),
    };
  }

  return { kind: 'idle', scene: [...inputs.scene] };
}
