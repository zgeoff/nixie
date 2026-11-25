import { readImageState } from '@heynixie/connectors';
import type { ImageState } from '@heynixie/connectors';
import { parsePackageSpec, regionContentSchema } from '@heynixie/contract';
import type { RegionContent } from '@heynixie/contract';
import type { JSONObject } from '@heynixie/log';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { readDeviceByShortID } from '../device/read-device-by-short-id';
import { pickDeclaredFetches } from '../fetch/pick-declared-fetches';
import { readLayout } from '../layout/read-layout';
import { readDevicePackage } from '../package/read-device-packages';
import type { DeclaredFetch } from '../stream/create-page-fetches';
import type { Device, LayoutView, RegionView } from '../types';
import type { DeviceToolOptions } from './device-tool-options';
import { pickRegionRefusal } from './pick-region-refusal';
import type { PageFault, RegionRefusal } from './pick-region-refusal';

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

      // the declared fetches of a page, and the host of each; empty for any other content
      readonly fetches: readonly DeclaredFetch[];
      readonly hosts: readonly string[];
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
  const content = regionContentSchema.safeParse(args.content);

  if (!content.success) {
    return { status: 'invalid', message: z.prettifyError(content.error) };
  }

  const device = await readDeviceByShortID(options.log.writer.db, args.device);

  const layout =
    device === null ? null : await readLayout(options.log, device.deviceID, options.clock.now());

  const region = layout?.regions.find((candidate) => candidate.name === args.region);

  const states = await readImageStates(options, content.data);
  const page = await readPage(options, content.data);

  const refusal = pickRegionRefusal({
    device,
    isRegionKnown: region !== undefined,
    pageFault: page.fault,
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
    fetches: page.fetches,
    hosts: page.hosts,
  };
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

interface PickedPage {
  readonly fault: PageFault | null;
  readonly fetches: readonly DeclaredFetch[];
  readonly hosts: readonly string[];
}

// The first fault of the packages and fetches that a page names, and its fetches. A package that
// no approval covers, a fetch that is no public https URL, and a fetch with no fetch sandbox each
// refuse the call, so a page that names one never reaches a device.
async function readPage(options: DeviceToolOptions, content: RegionContent): Promise<PickedPage> {
  const none: PickedPage = { fault: null, fetches: [], hosts: [] };

  if (content.kind !== 'html') {
    return none;
  }

  for (const spec of content.packages ?? []) {
    const parsed = parsePackageSpec(spec);

    const found =
      parsed === null
        ? null
        : await readDevicePackage(options.log.writer.db, parsed.name, parsed.version);

    if (found === null) {
      return { ...none, fault: 'UNKNOWN_PACKAGE' };
    }
  }

  if (content.fetches === undefined || content.fetches.length === 0) {
    return none;
  }

  if (options.fetching === undefined) {
    return { ...none, fault: 'FETCHES_UNAVAILABLE' };
  }

  const picked = pickDeclaredFetches(content.fetches, options.fetching.checkAddress);

  return picked.status === 'refused'
    ? { ...none, fault: 'BAD_FETCH' }
    : { fault: null, fetches: picked.fetches, hosts: picked.hosts };
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
