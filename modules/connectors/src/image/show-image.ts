import type { ToolImage, ToolRun } from '@heynixie/tools';
import { fitFetchedImage } from '../fetch/fit-fetched-image';

export interface ShownImage {
  // the picture for the model, or null when the session's caps leave no room for it
  readonly image: ToolImage | null;
}

// Passes the picture through the fit and the reservation that a fetched image takes. A call that
// holds room for its picture names the hold in `heldKey`, and the hold goes in the same synchronous
// step that reserves the picture, so a call beside it cannot take the room in between.
export async function showImage(
  run: ToolRun,
  png: Uint8Array,
  longEdge: number,
  heldKey?: string,
): Promise<ShownImage> {
  const reserve = run.session?.reserveImages;

  if (reserve === undefined) {
    return { image: null };
  }

  const fitted = await fitFetchedImage(png, longEdge);

  if (heldKey !== undefined) {
    run.session?.releaseImageRoom?.(heldKey);
  }

  return fitted.kind === 'image' && reserve([fitted.image])
    ? { image: fitted.image }
    : { image: null };
}
