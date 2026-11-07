import { z } from 'zod';

const agentSDKSessionPointSchema = z
  .object({
    harness: z.literal('agent-sdk'),
    sessionID: z.uuid(),
    messageID: z.uuid(),
  })
  .readonly();

// A point stored before session points named their harness came from the Agent SDK, the one
// harness nixie ran then.
export const sessionPointSchema = z.preprocess(
  toTaggedPoint,
  z.discriminatedUnion('harness', [agentSDKSessionPointSchema]),
);

export type SessionPoint = z.output<typeof sessionPointSchema>;

function toTaggedPoint(point: unknown): unknown {
  return typeof point === 'object' && point !== null && !('harness' in point)
    ? { ...point, harness: 'agent-sdk' }
    : point;
}
