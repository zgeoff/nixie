import type { JSONObject } from '@heynixie/log';
import type { DirectResult, ToolImage, ToolRun } from '@heynixie/tools';
import { fitFetchedImage } from '../fetch/fit-fetched-image';
import type { ComputerToolOptions } from './computer-tool-options';

export interface Picture {
  readonly base64: string;
  readonly result: JSONObject;

  // Set for a picture of the desktop: the result's width and height become those of the picture the
  // model sees, which is smaller than the desktop when the image limit is below the desktop's long
  // edge.
  readonly isDesktop?: true;
}

// Fits the picture and reserves its place beside the result; isShown says whether it fit.
export async function showPicture(
  options: ComputerToolOptions,
  run: ToolRun,
  picture: Picture,
): Promise<{ readonly status: 'ok' } & DirectResult> {
  const fitted = await fitFetchedImage(
    Buffer.from(picture.base64, 'base64'),
    options.fetch.imageLongEdge,
  );

  const reserved =
    fitted.kind === 'image' && (run.session?.reserveImages?.([fitted.image]) ?? true);

  return {
    status: 'ok',
    result: {
      ...picture.result,
      ...(fitted.kind === 'image' && picture.isDesktop === true
        ? { width: fitted.width, height: fitted.height }
        : {}),
      isShown: reserved,
    },
    images: reserved && fitted.kind === 'image' ? [fitted.image] : [],
  };
}

// Fits a picture for the model or a card, or returns null when it cannot be read or fit.
export async function fitPicture(
  options: ComputerToolOptions,
  base64: string,
): Promise<ToolImage | null> {
  const fitted = await fitFetchedImage(Buffer.from(base64, 'base64'), options.fetch.imageLongEdge);

  return fitted.kind === 'image' ? fitted.image : null;
}
