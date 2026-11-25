import { fitFetchedImage } from '@heynixie/connectors';
import type { ToolImage } from '@heynixie/tools';
import { collectLayoutImages } from '../layout/collect-layout-images';
import { readLayout } from '../layout/read-layout';
import { collectScreenImages } from '../screen/collect-screen-images';
import { readScreenState } from '../screen/read-screen-state';
import type { PageError } from '../stream/create-page-errors';
import type { DevicePreviewOptions, DeviceToolOptions } from '../tool/device-tool-options';
import type { Device, LayoutView, ScreenPixels } from '../types';
import { buildPreviewPage } from './build-preview-page';
import { pickPreviewSurface } from './pick-preview-surface';
import { readPreviewImages } from './read-preview-images';

export interface DevicePreview {
  // null while the device is offline, which holds no size
  readonly pixels: ScreenPixels | null;
  readonly errors: readonly PageError[];

  // null when the preview has no picture, whatever the reason
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

async function drawPicture(
  options: DeviceToolOptions,
  preview: DevicePreviewOptions,
  device: Device,
  inputs: PictureInputs,
): Promise<ToolImage | null> {
  const state = await readScreenState(options.log, device, inputs.nowMs);

  const surface = pickPreviewSurface(state, inputs.layout);

  const images = await readPreviewImages(options.log, [
    ...collectScreenImages(state),
    ...collectLayoutImages(inputs.layout),
  ]);

  const outcome = await preview.draw({
    width: Math.max(1, Math.round(inputs.pixels.width / inputs.pixels.pixelRatio)),
    height: Math.max(1, Math.round(inputs.pixels.height / inputs.pixels.pixelRatio)),
    pixelRatio: inputs.pixels.pixelRatio,
    files: buildPreviewPage({
      surface,
      images,
      nowMs: inputs.nowMs,
      timeZone: preview.timeZone,
    }),
  });

  if (outcome.kind === 'failed') {
    return null;
  }

  const fitted = await fitFetchedImage(outcome.png, preview.imageLongEdge);

  return fitted.kind === 'image' ? fitted.image : null;
}
