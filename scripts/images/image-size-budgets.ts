import type { ImageName } from './image-names.ts';

// Each image's size budget in MiB: the size of the image when the budget was set, plus 15%,
// rounded up. A size is what `docker image inspect` reports, the image's uncompressed size.
export const imageSizeBudgets: Record<ImageName, number> = {
  conversation: 270,
  fetch: 93,
  code: 335,
  computer: 742,
  codex: 229,
  backup: 105,
  web: 94,
  nixie: 151,
};
