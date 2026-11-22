import type { mockViewStore } from './mock-view-store';

type MockImageRow = ReturnType<typeof mockViewStore.images.all>[number];

// A forgotten image reads with no name and no prompt, and keeps its edit source.
export function toMockGalleryImage(row: MockImageRow) {
  return {
    image: row.image,
    name: row.isForgotten ? null : row.name,
    prompt: row.isForgotten ? null : row.prompt,
    from: row.from,
    source: row.source,
    isPinned: row.isPinned,
    isForgotten: row.isForgotten,
    createdAt: row.createdAt,
  };
}
