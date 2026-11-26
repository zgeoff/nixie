import type { ScriptedModelRequest } from '@heynixie/testing';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

const onCallDevice =
  /"shortID":"(?<id>[a-z0-9]+)","name":"[^"]*","deviceKind":"[a-z]+","onCall":true/u;

// The short ID of the device that a devices.list result in the request marks onCall, or an empty
// string.
export function getOnCallDeviceID(body: ScriptedBody): string {
  const text = JSON.stringify(body.messages ?? []).replaceAll(String.raw`\"`, '"');

  return onCallDevice.exec(text)?.groups?.['id'] ?? '';
}
