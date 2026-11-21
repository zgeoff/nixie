import type { ToolImage, ToolRun } from '@heynixie/tools';
import { fitFetchedImage } from '../fetch/fit-fetched-image';

export interface ShownImage {
  // the picture for the model, or null when the session's caps leave no room for it
  readonly image: ToolImage | null;
}

// Passes the picture through the fit and the reservation that a fetched image takes.
export async function showImage(
  run: ToolRun,
  png: Uint8Array,
  longEdge: number,
): Promise<ShownImage> {
  const reserve = run.session?.reserveImages;

  if (reserve === undefined) {
    return { image: null };
  }

  const fitted = await fitFetchedImage(png, longEdge);

  return fitted.kind === 'image' && reserve([fitted.image])
    ? { image: fitted.image }
    : { image: null };
}
