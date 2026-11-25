import type { PageData, ScreenContent } from '@heynixie/contract';
import type { PageFetchReply, RenderFile } from '@heynixie/wire';
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

  // the retained message of each page region, by the region's name, which its page takes as its
  // first message
  readonly retained?: ReadonlyMap<string, PageData>;

  // The files of each approved package that the pages name, by the spec, which a page's policy
  // opens to and the render serves under packages/. A package with no entry opens nothing.
  readonly packages?: ReadonlyMap<string, readonly RenderFile[]>;

  // What each page region's declared fetches last returned, by region and URL
  readonly fetchReplies?: ReadonlyMap<string, Readonly<Record<string, PageFetchReply>>>;

  readonly nowMs: number;
  readonly timeZone: string;
}
