import { fitFetchedImage } from '@heynixie/connectors';
import type { ToolImage } from '@heynixie/tools';
import { readLayout } from '../layout/read-layout';
import { readScreenState } from '../screen/read-screen-state';
import type { PageError } from '../stream/create-page-errors';
import type { DevicePreviewOptions, DeviceToolOptions } from '../tool/device-tool-options';
import type { Device, LayoutView, ScreenPixels } from '../types';
import { buildPreviewPage } from './build-preview-page';
import { collectSurfaceImages } from './collect-surface-images';
import { pickPreviewSurface } from './pick-preview-surface';
import { readPreviewImages } from './read-preview-images';

export interface DevicePreview {
  // null while the device is offline, which holds no size
  readonly pixels: ScreenPixels | null;
  readonly errors: readonly PageError[];

  // null when the preview has no picture, whatever the reason; its long edge is at most the
  // model's, so a large screen comes back smaller
  readonly picture: ToolImage | null;
}

// What the device's screen looks like now, and the errors its regions reported. The picture comes
// from the render sandbox, which draws the layout at the device's size, and a render that cannot
// run or fails leaves it null.
export async function runDevicePreview(
  options: DeviceToolOptions,
  device: Device,
): Promise<DevicePreview> {
  const nowMs = options.clock.now();

  const layout = await readLayout(options.log, device.deviceID, nowMs);

  const pixels = options.streams.readPixels(device.deviceID);
  const errors = options.streams.errors.read(device.deviceID, collectShownIDs(layout));

  if (options.preview === undefined || pixels === null) {
    return { pixels, errors, picture: null };
  }

  return {
    pixels,
    errors,
    picture: await drawPicture(options, options.preview, device, { layout, pixels, nowMs }),
  };
}

// the content each region shows now, by the region's name
function collectShownIDs(layout: LayoutView | null): ReadonlyMap<string, string> {
  return new Map(
    (layout?.regions ?? []).flatMap((region) =>
      region.shown === null ? [] : [[region.name, region.shown.shownID] as const],
    ),
  );
}

interface PictureInputs {
  readonly layout: LayoutView | null;
  readonly pixels: ScreenPixels;
  readonly nowMs: number;
}

// The render's own picture of a screen, so its size is the device's, and a screen of 8000 by 6000
// pixels draws. The cap still stops a device that claims a screen of 20000 by 20000.
const maxPreviewPixels = 64_000_000;

async function drawPicture(
  options: DeviceToolOptions,
  preview: DevicePreviewOptions,
  device: Device,
  inputs: PictureInputs,
): Promise<ToolImage | null> {
  const state = await readScreenState(options.log, device, inputs.nowMs);

  const surface = pickPreviewSurface(state, inputs.layout);

  const images = await readPreviewImages(options.log, collectSurfaceImages(surface));

  const outcome = await preview.draw({
    width: inputs.pixels.width,
    height: inputs.pixels.height,
    pixelRatio: inputs.pixels.pixelRatio,
    files: buildPreviewPage({
      surface,
      images,
      nowMs: inputs.nowMs,
      timeZone: inputs.pixels.timeZone ?? preview.timeZone,
    }),
  });

  if (outcome.kind === 'failed') {
    return null;
  }

  const fitted = await fitFetchedImage(outcome.png, preview.imageLongEdge, maxPreviewPixels);

  return fitted.kind === 'image' ? fitted.image : null;
}
