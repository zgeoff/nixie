import type { ScriptedModelRequest } from '@heynixie/testing';
import { collectListedDevices } from './collect-listed-devices';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

export function getOnCallDeviceID(body: ScriptedBody): string {
  return collectListedDevices(body).find((device) => device.onCall === true)?.shortID ?? '';
}
