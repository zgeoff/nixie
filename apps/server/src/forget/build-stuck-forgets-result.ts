import type { StuckForget } from '@heynixie/api';
import type { JSONObject } from '@heynixie/log';

const msPerMinute = 60_000;

// The result names each forget by its kind and short ID, and never by the forget's own ID.
export function buildStuckForgetsResult(stuck: readonly StuckForget[]): JSONObject {
  return {
    stuck: stuck.map((forget) => ({
      kind: forget.kind,
      id: forget.shortID,
      openMinutes: Math.floor(forget.openForMs / msPerMinute),
    })),
  };
}
