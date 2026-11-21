import { readImageState } from '@heynixie/connectors';
import type { ScreenContent } from '@heynixie/contract';
import { screenContentSchema } from '@heynixie/contract';
import type { Log } from '@heynixie/log';
import { z } from 'zod';
import { deviceIdleSetCodec } from '../record/device-idle-set-codec';
import { deviceShownCodec } from '../record/device-shown-codec';
import type { Device, ScreenState } from '../types';
import { pickScreenState } from './pick-screen-state';
import type { ShownContent } from './pick-screen-state';
import { readScreenRecord } from './read-screen-record';

// What a device's screen shows now. A show or a scene that a forget removed counts as none, an
// image that was forgotten leaves the content that held it, and a show that names a missing image
// shows nothing.
export async function readScreenState(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  device: Device,
  nowMs: number,
): Promise<ScreenState> {
  const [shown, scene] = await Promise.all([
    readShown(log, device.shownSequence),
    readScene(log, device.idleSequence),
  ]);

  return pickScreenState({ shown, scene, nowMs });
}

async function readShown(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number | null,
): Promise<ShownContent | null> {
  const record = await readScreenRecord(log, sequence);

  if (record === null || record.fields === null) {
    return null;
  }

  const parsed = screenContentSchema.safeParse(record.fields['content']);

  if (!parsed.success || !(await probeContentReadable(log, parsed.data))) {
    return null;
  }

  return { content: parsed.data, untilMs: deviceShownCodec.decode(record.payload).until };
}

async function probeContentReadable(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  content: ScreenContent,
): Promise<boolean> {
  if (content.kind === 'markdown') {
    return true;
  }

  const image = await readImageState(log, content.image);

  return image.state === 'ok';
}

const sceneSchema = z.array(screenContentSchema);

async function readScene(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number | null,
): Promise<readonly ScreenContent[]> {
  const record = await readScreenRecord(log, sequence);

  if (record === null || record.fields === null) {
    return [];
  }

  deviceIdleSetCodec.decode(record.payload);

  const parsed = sceneSchema.safeParse(record.fields['scene']);

  if (!parsed.success) {
    return [];
  }

  const readable = await Promise.all(parsed.data.map((block) => probeContentReadable(log, block)));

  return parsed.data.filter((_block, index) => readable[index] === true);
}
