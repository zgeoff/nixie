import type { ImageRoom } from '@heynixie/tools';
import type { LiveImages } from '../inbox/read-live-inbox';

// What the live tally leaves of the budget, in the same base64 bytes that the reserver counts.
export function makeImageRoomReader(live: LiveImages): () => ImageRoom {
  return () => ({
    bytes: Math.max(0, live.budget.bytes - live.spent.bytes),
    count: Math.max(0, live.budget.count - live.spent.count),
  });
}
