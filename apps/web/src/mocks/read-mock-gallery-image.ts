import { mockViewStore } from './mock-view-store';
import { toMockGalleryImage } from './to-mock-gallery-image';

export function readMockGalleryImage(image: string) {
  const row = mockViewStore.images.findFirst((query) =>
    query.where((entry) => entry.image === image),
  );

  return row === undefined ? null : toMockGalleryImage(row);
}
