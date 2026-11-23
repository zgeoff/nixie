import { readImageState } from '@heynixie/connectors';
import type { ImageState } from '@heynixie/connectors';
import { regionContentSchema } from '@heynixie/contract';
import type { RegionContent } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';
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
  const isPage = args.content.kind === 'page';
  const content = regionContentSchema.safeParse(args.content);

  if (!isPage && !content.success) {
    return { status: 'invalid', message: z.prettifyError(content.error) };
  }

  const device = await readDeviceByShortID(options.log.writer.db, args.device);

  const layout =
    device === null ? null : await readLayout(options.log, device.deviceID, options.clock.now());

  const region = layout?.regions.find((candidate) => candidate.name === args.region);
  const named = content.success ? await nameImage(options, content.data) : null;

  const refusal = pickRegionRefusal({
    device,
    isRegionKnown: region !== undefined,
    isPage,
    images: named === null ? [] : [named.state],
    isOnline: options.streams.isOnline(args.device),
  });

  if (refusal !== null || device === null || layout === null || region === undefined) {
    return { status: 'refused', refusal: refusal ?? 'UNKNOWN_REGION' };
  }

  if (named === null) {
    return { status: 'refused', refusal: 'PAGE_NOT_BUILT' };
  }

  return { status: 'ready', arguments: args, device, layout, region, content: named.content };
}

interface NamedContent {
  readonly content: RegionContent;
  readonly state: ImageState;
}

// The content with its image named by its short ID, and the state of that image.
async function nameImage(
  options: DeviceToolOptions,
  content: RegionContent,
): Promise<NamedContent> {
  if (content.kind !== 'image') {
    return { content, state: 'ok' };
  }

  const found = await readImageState(options.log, content.image);

  return {
    content: { ...content, image: found.image ?? content.image },
    state: found.state,
  };
}
