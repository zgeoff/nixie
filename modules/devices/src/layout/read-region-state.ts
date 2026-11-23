import { readImageState } from '@heynixie/connectors';
import { regionContentSchema } from '@heynixie/contract';
import type { RegionContent } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import { deviceRegionShownCodec } from '../record/device-region-shown-codec';
import { readScreenRecord } from '../screen/read-screen-record';
import type { ShownRegion } from '../types';
import { isRegionActive } from './is-region-active';

// the longest run of `then: 'previous'` links the reader follows
const maxChain = 50;

// What a region shows now, from the record its row points at. A record whose minutes passed gives
// way to the one it covered when it asked for that, which gives way the same way, and else to a
// blank region. A record that a forget or a reset removed, or whose image is gone, shows nothing.
export async function readRegionState(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
  nowMs: number,
): Promise<ShownRegion | null> {
  const next: { sequence: number | null } = { sequence };

  for (let hops = 0; hops < maxChain && next.sequence !== null; hops += 1) {
    const record = await readScreenRecord(log, next.sequence);

    if (record === null) {
      return null;
    }

    const payload = deviceRegionShownCodec.decode(record.payload);

    if (isRegionActive(payload.until, nowMs)) {
      return readShown(log, next.sequence, payload, record.fields?.['content']);
    }

    next.sequence = payload.onEnd === 'previous' ? payload.previous : null;
  }

  return null;
}

interface ShownPayload {
  readonly shownID: string;
  readonly until: number | null;
}

async function readShown(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
  payload: ShownPayload,
  stored: unknown,
): Promise<ShownRegion | null> {
  const parsed = regionContentSchema.safeParse(stored);

  if (!parsed.success || !(await probeContentReadable(log, parsed.data))) {
    return null;
  }

  return {
    shownID: payload.shownID,
    sequence,
    content: parsed.data,
    untilMs: payload.until,
  };
}

async function probeContentReadable(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  content: RegionContent,
): Promise<boolean> {
  if (content.kind !== 'image') {
    return true;
  }

  const image = await readImageState(log, content.image);

  return image.state === 'ok';
}
