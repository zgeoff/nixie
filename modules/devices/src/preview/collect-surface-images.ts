import { collectLayoutImages } from '../layout/collect-layout-images';
import { collectPageImages } from '../layout/collect-page-images';
import type { PreviewSurface } from './types';

// The IDs of the images that a surface draws. An image that a show covers is left out, because the
// render never draws it and each image adds to the one frame that carries the files.
export function collectSurfaceImages(surface: PreviewSurface): readonly string[] {
  if (surface.kind === 'layout') {
    return [...collectLayoutImages(surface.layout), ...collectPageImages(surface.layout)];
  }

  return surface.blocks.flatMap((block) => (block.kind === 'image' ? [block.image] : []));
}
