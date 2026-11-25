import type { ScreenContent } from '@heynixie/contract';
import type { DeviceLayout, ScreenEvent } from './use-device-events';

export type Surface =
  | { readonly kind: 'blocks'; readonly blocks: readonly ScreenContent[] }
  | { readonly kind: 'layout'; readonly layout: NonNullable<DeviceLayout> };

// What the screen draws, in the order the design fixes: a show that has not ended, then the layout
// while at least one region shows content or has a background, then the idle scene. Before the stream's first event the
// screen is black.
export function pickSurface(event: ScreenEvent | null, layout: DeviceLayout): Surface {
  if (event?.kind === 'show') {
    return { kind: 'blocks', blocks: [event.content] };
  }

  const isLayoutShown =
    layout !== null &&
    layout.regions.some((region) => region.content !== null || region.background !== null);

  if (isLayoutShown) {
    return { kind: 'layout', layout };
  }

  return { kind: 'blocks', blocks: event?.kind === 'idle' ? event.scene : [] };
}
