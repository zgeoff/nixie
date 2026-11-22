import { mockViewStore } from './mock-view-store';
import { toMockGalleryImage } from './to-mock-gallery-image';

const pageSize = 30;

interface MockGalleryInput {
  readonly pinnedOnly?: boolean | undefined;
  readonly cursor?: string | undefined;
}

// The readable images of the mock store, newest first, in pages of the size the API uses.
export function readMockGalleryPage(input: MockGalleryInput) {
  const before = input.cursor === undefined ? Number.POSITIVE_INFINITY : Number(input.cursor);

  const matching = mockViewStore.images
    .all()
    .filter((row) => !row.isForgotten)
    .filter((row) => input.pinnedOnly !== true || row.isPinned)
    .filter((row) => row.rowID < before)
    .toSorted((left, right) => right.rowID - left.rowID);

  const page = matching.slice(0, pageSize);
  const last = page.at(-1);

  return {
    images: page.map((row) => toMockGalleryImage(row)),
    nextCursor: matching.length > pageSize && last !== undefined ? String(last.rowID) : null,
  };
}
