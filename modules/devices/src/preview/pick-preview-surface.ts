import type { LayoutView, ScreenState } from '../types';
import type { PreviewSurface } from './types';

// What the screen draws, in the order the device page picks: a show, the layout while a region
// shows content or has a background, then the idle scene.
export function pickPreviewSurface(state: ScreenState, layout: LayoutView | null): PreviewSurface {
  if (state.kind === 'show') {
    return { kind: 'blocks', blocks: [state.content] };
  }

  if (
    layout !== null &&
    layout.regions.some((region) => region.shown !== null || region.background !== null)
  ) {
    return { kind: 'layout', layout };
  }

  return { kind: 'blocks', blocks: state.scene };
}
