import { readImageState } from '@heynixie/connectors';
import type { ImageState } from '@heynixie/connectors';
import { regionContentSchema } from '@heynixie/contract';
import type { RegionContent } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { readLayout } from '../layout/read-layout';
import type { Device, LayoutView, RegionView } from '../types';
import type { DeviceToolOptions } from './device-tool-options';
import { pickRegionRefusal } from './pick-region-refusal';
import type { RegionRefusal } from './pick-region-refusal';

const regionArguments = z.object({
  device: z.string(),
  region: z.string(),
  content: z.looseObject({ kind: z.string() }),
  minutes: z.int().min(1).max(1440).optional(),
  // oxlint-disable-next-line unicorn/no-thenable -- the design names this input `then`
  then: z.enum(['blank', 'previous']).optional(),
});

export type RegionCall =
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'refused'; readonly refusal: RegionRefusal }
  | {
      readonly status: 'ready';
      readonly arguments: z.infer<typeof regionArguments>;
      readonly device: Device;
      readonly layout: LayoutView;
      readonly region: RegionView;

      // the content, with an image named by its short ID
      readonly content: RegionContent;
    };

// Reads what a device.region call needs as of now: the device, its layout and the region the call
// names, and the state of the image the content names. The layout is read each time the call runs,
// so a call that waited for approval finds a region that a new layout removed in the meantime.
export async function readRegionCall(
  options: DeviceToolOptions,
  input: JSONObject,
): Promise<RegionCall> {
  const parsed = regionArguments.safeParse(input);

  if (!parsed.success) {
    return { status: 'invalid', message: z.prettifyError(parsed.error) };
  }

  const args = parsed.data;
  const unbuilt = pickUnbuiltPart(args.content);
  const content = regionContentSchema.safeParse(args.content);

  if (!content.success) {
    return { status: 'invalid', message: z.prettifyError(content.error) };
  }

  const device = await readDeviceByShortID(options.log.writer.db, args.device);

  const layout =
    device === null ? null : await readLayout(options.log, device.deviceID, options.clock.now());

  const region = layout?.regions.find((candidate) => candidate.name === args.region);

  const states = await readImageStates(options, content.data);

  const refusal = pickRegionRefusal({
    device,
    isRegionKnown: region !== undefined,
    unbuilt,
    images: states,
    isOnline: options.streams.isOnline(args.device),
  });

  if (refusal !== null || device === null || layout === null || region === undefined) {
    return { status: 'refused', refusal: refusal ?? 'UNKNOWN_REGION' };
  }

  return {
    status: 'ready',
    arguments: args,
    device,
    layout,
    region,
    content: await nameImage(options, content.data),
  };
}

// The part of a page that a later release builds, when the call names it. The content schema
// strips a key it does not know, so this reads the keys before the parse.
function pickUnbuiltPart(
  content: Readonly<Record<string, unknown>>,
): 'PACKAGES_NOT_BUILT' | 'FETCHES_NOT_BUILT' | null {
  if (content['kind'] !== 'html') {
    return null;
  }

  if (content['packages'] !== undefined) {
    return 'PACKAGES_NOT_BUILT';
  }

  return content['fetches'] === undefined ? null : 'FETCHES_NOT_BUILT';
}

// The state of each image that the content names: the one image of an image region, or each image
// that a page declares.
function readImageStates(
  options: DeviceToolOptions,
  content: RegionContent,
): Promise<readonly ImageState[]> {
  const images = match(content)
    .with({ kind: 'image' }, (image) => [image.image])
    .with({ kind: 'html' }, (page) => page.images ?? [])
    .otherwise(() => []);

  return Promise.all(images.map((image) => readOneImageState(options, image)));
}

async function readOneImageState(options: DeviceToolOptions, image: string): Promise<ImageState> {
  const found = await readImageState(options.log, image);

  return found.state;
}

// The content with an image region's image named by its short ID. A page keeps each declared ID as
// written, because its script names the image by that ID.
async function nameImage(
  options: DeviceToolOptions,
  content: RegionContent,
): Promise<RegionContent> {
  if (content.kind !== 'image') {
    return content;
  }

  const found = await readImageState(options.log, content.image);

  return { ...content, image: found.image ?? content.image };
}
