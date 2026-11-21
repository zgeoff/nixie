import { largestImageBytes } from '@heynixie/connectors';
import type { ToolSession } from '@heynixie/tools';
import type { LiveImages } from '../inbox/read-live-inbox';
import { isPastImageBudget } from '../utils/is-past-image-budget';
import { mergeImageTallies } from '../utils/merge-image-tallies';

type RoomHolder = Required<Pick<ToolSession, 'holdImageRoom' | 'releaseImageRoom'>>;

const heldImage = { bytes: largestImageBytes, count: 1 };

// Holds room for one image at the largest size in the live tally that the reserver counts, so a
// call that checks the caps and a call beside it cannot both take the last room.
export function makeImageRoomHolder(live: LiveImages): RoomHolder {
  const held = new Set<string>();

  return {
    holdImageRoom: (key) => {
      if (held.has(key)) {
        return true;
      }

      if (isPastImageBudget(live.spent, heldImage, live.budget)) {
        return false;
      }

      live.spent = mergeImageTallies(live.spent, heldImage);

      held.add(key);

      return true;
    },
    releaseImageRoom: (key) => {
      if (!held.delete(key)) {
        return;
      }

      live.spent = {
        bytes: Math.max(0, live.spent.bytes - heldImage.bytes),
        count: Math.max(0, live.spent.count - heldImage.count),
      };
    },
  };
}
