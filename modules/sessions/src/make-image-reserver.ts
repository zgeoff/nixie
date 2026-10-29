import type { ToolImage } from '@heynixie/tools';
import { isPastImageBudget } from './is-past-image-budget';
import { mergeImageTallies } from './merge-image-tallies';
import type { LiveImages } from './read-live-inbox';

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
