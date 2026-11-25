import type { ScreenContent } from '@heynixie/contract';
import type { RenderFile } from '@heynixie/wire';
import type { LayoutView } from '../types';

// What the screen draws, as the device page picks it: the blocks of a show or of the idle scene, or
// the layout.
export type PreviewSurface =
  | { readonly kind: 'blocks'; readonly blocks: readonly ScreenContent[] }
  | { readonly kind: 'layout'; readonly layout: LayoutView };

export interface PreviewPageInput {
  readonly surface: PreviewSurface;

  // the file of each image the surface shows, by the image's short ID; an image with no file draws
  // nothing
  readonly images: ReadonlyMap<string, RenderFile>;

  readonly nowMs: number;
  readonly timeZone: string;
}
