import type { ScriptedModelRequest } from '@heynixie/testing';
import { z } from 'zod';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

const listedDeviceSchema = z.looseObject({
  shortID: z.string(),
  name: z.string(),
  deviceKind: z.string(),
  onCall: z.boolean().exactOptional(),
});

export type ListedDevice = z.output<typeof listedDeviceSchema>;

// Every device of every devices.list result in the request, in the order the messages hold them.
// A result reaches the model as JSON text inside a message or a tool result block, so each string
// is parsed as JSON where it can be.
export function collectListedDevices(body: ScriptedBody): ListedDevice[] {
  return collectDevices(body.messages ?? []);
}

const devicesListSchema = z.looseObject({ devices: z.array(listedDeviceSchema) });

function collectDevices(value: unknown): ListedDevice[] {
  if (typeof value === 'string') {
    const parsed = parseJSONText(value);

    return parsed === undefined ? [] : collectDevices(parsed);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDevices(item));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const list = devicesListSchema.safeParse(value);

  return list.success
    ? list.data.devices
    : Object.values(value).flatMap((item) => collectDevices(item));
}

function parseJSONText(text: string): unknown {
  const trimmed = text.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    return parsed;
  } catch {
    return undefined;
  }
}
