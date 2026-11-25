import { imageLimits } from '@heynixie/contract';
import type { ToolImage } from '@heynixie/tools';
import { collectShownIDs } from '../layout/collect-shown-ids';
import { readLayout } from '../layout/read-layout';
import { readScreenState } from '../screen/read-screen-state';
import type { PageError } from '../stream/create-page-errors';
import type { DevicePreviewOptions, DeviceToolOptions } from '../tool/device-tool-options';
import type { Device, LayoutView, ScreenPixels } from '../types';
import { buildFetchReplies } from './build-fetch-replies';
import { buildPreviewPage } from './build-preview-page';
import { collectPagePackages } from './collect-page-packages';
import { collectSurfaceImages } from './collect-surface-images';
import { pickPreviewSurface } from './pick-preview-surface';
import { readPreviewImages } from './read-preview-images';
import { readPreviewPackages } from './read-preview-packages';

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

  const images = await readPreviewImages(options.log, collectSurfaceImages(surface));

  const retainedMessages = options.streams.messages.readRetained(
    device.deviceID,
    collectShownIDs(inputs.layout),
  );

  const retained = new Map(retainedMessages.map((message) => [message.region, message.data]));

  const packages = await readPreviewPackages(options.log, collectPagePackages(inputs.layout));

  const fetchReplies = buildFetchReplies(
    options.streams.fetches.readAll(device.deviceID, collectShownIDs(inputs.layout)),
  );

  const outcome = await preview.draw({
    width: inputs.pixels.width,
    height: inputs.pixels.height,
    pixelRatio: inputs.pixels.pixelRatio,
    files: buildPreviewPage({
      surface,
      images,
      retained,
      packages,
      fetchReplies,
      nowMs: inputs.nowMs,
      timeZone: inputs.pixels.timeZone ?? preview.timeZone,
    }),
  });

  if (outcome.kind === 'failed') {
    return null;
  }

  // The picture keeps the device's exact size. One past the byte limit that the model takes has no
  // room, so the preview has no picture.
  if (outcome.png.byteLength > imageLimits.bytes) {
    return null;
  }

  return { mediaType: 'image/png', bytes: outcome.png };
}
