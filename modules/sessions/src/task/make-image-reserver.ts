import type { ToolImage } from '@heynixie/tools';
import type { LiveImages } from '../inbox/read-live-inbox';
import { isPastImageBudget } from '../utils/is-past-image-budget';
import { mergeImageTallies } from '../utils/merge-image-tallies';

// The tally counts an image by its base64 length, the form the guest sends the model.
export function makeImageReserver(live: LiveImages): (images: readonly ToolImage[]) => boolean {
  return (images) => {
    const added = {
      bytes: images.reduce((total, image) => total + Math.ceil(image.bytes.length / 3) * 4, 0),
      count: images.length,
    };

    if (isPastImageBudget(live.spent, added, live.budget)) {
      return false;
    }

    live.spent = mergeImageTallies(live.spent, added);

    return true;
  };
}
