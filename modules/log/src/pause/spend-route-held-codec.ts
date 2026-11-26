import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A step of the task was refused on the route, or found its route stopped, so the task waits until
// the route's stop clears. The record goes on no thread.
export const spendRouteHeldCodec = defineRecordCodec(
  'spend.route_held',
  z.object({ taskID: z.string(), route: z.string() }),
);
