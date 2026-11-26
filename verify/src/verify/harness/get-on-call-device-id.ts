import type { ScriptedModelRequest } from '@heynixie/testing';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

const onCallDevice =
  /"shortID":"(?<id>[a-z0-9]+)","name":"[^"]*","deviceKind":"[a-z]+","onCall":true/u;

export function getOnCallDeviceID(body: ScriptedBody): string {
  const text = JSON.stringify(body.messages ?? []).replaceAll(String.raw`\"`, '"');

  return onCallDevice.exec(text)?.groups?.['id'] ?? '';
}
