import { z } from 'zod';
import type { DeviceCapabilities } from '../types';

const capabilitiesSchema = z.object({
  screen: z.boolean(),
  camera: z.boolean(),
  speaker: z.boolean(),
  microphone: z.boolean(),
});

export function parseDeviceCapabilities(json: string): DeviceCapabilities {
  return capabilitiesSchema.parse(JSON.parse(json));
}
