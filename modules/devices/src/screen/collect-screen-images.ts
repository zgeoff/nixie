import type { ScreenState } from '../types';

// The IDs of the images a screen shows now, which are all a device may read.
export function collectScreenImages(state: ScreenState): readonly string[] {
  const blocks = state.kind === 'show' ? [state.content] : state.scene;

  return blocks.flatMap((block) => (block.kind === 'image' ? [block.image] : []));
}
