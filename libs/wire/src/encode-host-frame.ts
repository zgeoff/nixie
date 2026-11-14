import type { HarnessCapability } from './harness-ids';
import type { HostFrame } from './host-frame';

const encoder = new TextEncoder();

export const hostFrameNeeds: Readonly<Record<HostFrame['type'], HarnessCapability | null>> = {
  turn: null,
  message: 'live-messages',
  interrupt: 'interrupt',
  summarize: 'summarize',
  purge: null,
};

// A turn frame's resume key, and a non-null limits.modelCalls.
export const turnFieldNeeds = {
  resume: 'resume',
  modelCalls: 'turn-limit',
} as const satisfies Readonly<Record<string, HarnessCapability>>;

// The host's only encoder of host frames. It throws before it returns any bytes, so a frame or a
// field that the harness does not declare is never sent.
export function encodeHostFrame(
  capabilities: ReadonlySet<HarnessCapability>,
  frame: HostFrame,
): Uint8Array<ArrayBuffer> {
  const frameNeed = hostFrameNeeds[frame.type];

  if (frameNeed !== null && !capabilities.has(frameNeed)) {
    throw new Error(`The harness lacks ${frameNeed}, which a ${frame.type} frame needs`);
  }

  if (frame.type === 'turn') {
    if ('resume' in frame && !capabilities.has(turnFieldNeeds.resume)) {
      throw new Error(
        `The harness lacks ${turnFieldNeeds.resume}, which a turn frame's resume needs`,
      );
    }

    if (frame.limits.modelCalls !== null && !capabilities.has(turnFieldNeeds.modelCalls)) {
      throw new Error(
        `The harness lacks ${turnFieldNeeds.modelCalls}, which a turn frame's limits.modelCalls needs`,
      );
    }
  }

  return encoder.encode(JSON.stringify(frame));
}
