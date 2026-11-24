import type { ScriptedModelRequest } from '@heynixie/testing';

// The last message of the newest model request, as JSON text. It holds what nixie told the model
// last, such as the outcome of a call the owner approved.
export function readLastModelInput(requests: readonly ScriptedModelRequest[]): string {
  const messages = requests.at(-1)?.body?.messages ?? [];

  return JSON.stringify(messages.at(-1)?.content ?? null);
}
