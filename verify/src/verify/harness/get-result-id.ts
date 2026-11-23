import type { ScriptedModelRequest } from '@heynixie/testing';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

// The first value that the key names in a tool result of the request, or an empty string.
export function getResultID(body: ScriptedBody, key: string): string {
  const text = JSON.stringify(body.messages ?? []).replaceAll(String.raw`\"`, '"');

  return new RegExp(`"${key}":"([a-z0-9]+)"`, 'u').exec(text)?.[1] ?? '';
}
