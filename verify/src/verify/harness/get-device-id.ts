import type { ScriptedModelRequest } from '@heynixie/testing';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

// A device in a devices.list result: the one with this name, or the first that enrolled with a
// device code. The harness's own session is a client device that comes first in the list, so the
// first device is never the one a journey enrolled.
export type DeviceSelector = { readonly name: string } | { readonly kind: 'screen' };

export function getDeviceID(body: ScriptedBody, selector: DeviceSelector): string {
  const text = JSON.stringify(body.messages ?? []).replaceAll(String.raw`\"`, '"');
  const name = 'name' in selector ? escapeName(selector.name) : '[^"]*';
  const kind = 'kind' in selector ? selector.kind : '[a-z]+';

  const device = new RegExp(
    `"shortID":"(?<id>[a-z0-9]+)","name":"${name}","deviceKind":"${kind}"`,
    'u',
  ).exec(text);

  return device?.groups?.['id'] ?? '';
}

function escapeName(name: string): string {
  return name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}
