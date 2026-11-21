import type { ScriptedModelRequest, ScriptedReply } from '@heynixie/testing';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

export interface DeviceShowInput {
  readonly fit: 'whole' | 'fill';
  readonly text: string;
}

export interface SentPhoto {
  // resolves once the owner message that holds the photo is recorded
  readonly isSent: Promise<void>;
  readonly readEventID: () => number;
}

// The replies of a turn in which the model keeps the owner's photo and shows it on the first device
// it lists. The device and the image get their IDs when nixie creates them, so each tool call reads
// its ID from the result of the call before it.
export function buildDeviceShowReplies(input: DeviceShowInput, photo: SentPhoto): ScriptedReply[] {
  // The first reply waits for the photo's record, so the second reply, which names the photo by the
  // record's sequence, reads it when the model asks for it.
  return [
    { toolUse: { name: 'mcp__nixie__devices_list', input: {} }, gate: photo.isSent },
    {
      toolUse: {
        name: 'mcp__nixie__image_import',
        input: () => ({ photo: { eventID: String(photo.readEventID()), number: 1 } }),
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__device_show',
        input: (body: ScriptedBody) => ({
          device: getResultID(body, 'device'),
          content: { kind: 'image', image: getResultID(body, 'image'), fit: input.fit },
        }),
      },
    },
    { text: input.text },
  ];
}

// The first value that the key names in a tool result of the request, or an empty string.
function getResultID(body: ScriptedBody, key: string): string {
  const text = JSON.stringify(body.messages ?? []).replaceAll(String.raw`\"`, '"');

  return new RegExp(`"${key}":"([a-z0-9]+)"`, 'u').exec(text)?.[1] ?? '';
}
