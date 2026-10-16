export interface ItemPage<Item> {
  readonly items: readonly Item[];

  // the cursor the next page reads after, or null when this page is the last
  readonly next: number | null;
}

// Yields every item of every page in order, from the page after cursor 0 to the page whose next
// cursor is null. One loop walks the pages, so each item crosses one generator frame however many
// pages came before it, and the walk's time grows with the item count alone.
export async function* readPages<Item>(
  readPage: (after: number) => Promise<ItemPage<Item>>,
): AsyncGenerator<Item, void, undefined> {
  let after: number | null = 0;

  while (after !== null) {
    // oxlint-disable-next-line no-await-in-loop -- each page starts after the cursor the last one named
    const page: ItemPage<Item> = await readPage(after);

    yield* page.items;
    after = page.next;
  }
}
